import { useEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deriveUsageEvents,
  isQuietHours,
  type NotificationPreferences,
  type UsageEvent,
} from "@/lib/notification-events"
import { deliverUsageEvents } from "@/lib/notification-delivery"
import {
  appendRecentUsageEvents,
  listenNotificationStateUpdated,
  loadNotificationPreferences,
  loadRecentUsageEvents,
} from "@/lib/notification-settings"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { ProviderStatus } from "@/lib/provider-status"
import type { PluginState } from "@/hooks/app/types"

export function useNotificationEvents({
  pluginStates,
  providerStatuses,
  pluginsMeta,
}: {
  pluginStates: Record<string, PluginState>
  providerStatuses: Record<string, ProviderStatus>
  pluginsMeta: PluginMeta[]
}) {
  const [activeEvents, setActiveEvents] = useState<UsageEvent[]>([])
  const [notificationHistoryLoaded, setNotificationHistoryLoaded] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const previousOutputs = useRef<Record<string, PluginOutput | undefined>>({})
  const previousStatuses = useRef<Record<string, ProviderStatus | undefined>>({})
  const handledEventIds = useRef<Set<string>>(new Set())
  const outputs = useMemo(
    () =>
      Object.fromEntries(
        pluginsMeta.map((plugin) => [plugin.id, pluginStates[plugin.id]?.data ?? undefined])
      ),
    [pluginStates, pluginsMeta]
  )

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void Promise.all([loadNotificationPreferences(), loadRecentUsageEvents()]).then(
      ([nextPreferences, recentEvents]) => {
        if (disposed) return
        setPreferences(nextPreferences)
        for (const event of recentEvents) handledEventIds.current.add(event.id)
        setNotificationHistoryLoaded(true)
      }
    )
    void listenNotificationStateUpdated((update) => {
      if (update.type === "preferences") setPreferences(update.preferences)
      else if (update.type === "events") {
        for (const event of update.events) handledEventIds.current.add(event.id)
      }
    }).then((dispose) => {
      if (disposed) dispose()
      else unlisten = dispose
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    const events = deriveUsageEvents({
      previousOutputs: previousOutputs.current,
      outputs,
      previousStatuses: previousStatuses.current,
      statuses: providerStatuses,
      preferences,
    })
    if (!notificationHistoryLoaded) return

    previousOutputs.current = outputs
    previousStatuses.current = providerStatuses
    if (events.length === 0) return

    void appendRecentUsageEvents(events).catch((error) => {
      console.error("Failed to persist usage notification events:", error)
    })
    if (!preferences.enabled || isQuietHours(preferences)) return

    const eventsToDeliver = events.filter((event) => !handledEventIds.current.has(event.id))
    if (eventsToDeliver.length === 0) return
    for (const event of eventsToDeliver) handledEventIds.current.add(event.id)

    void deliverUsageEvents(eventsToDeliver)
      .then((delivered) => {
        if (!delivered) setActiveEvents(eventsToDeliver)
      })
      .catch((error) => {
        console.error("Failed to deliver usage notification:", error)
        setActiveEvents(eventsToDeliver)
      })
  }, [notificationHistoryLoaded, outputs, preferences, providerStatuses])

  return {
    activeEvents,
    dismissNotifications: () => setActiveEvents([]),
  }
}
