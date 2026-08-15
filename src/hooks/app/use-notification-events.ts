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
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  )
  const previousOutputs = useRef<Record<string, PluginOutput | undefined>>({})
  const previousStatuses = useRef<Record<string, ProviderStatus | undefined>>({})
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
    void loadNotificationPreferences().then((value) => {
      if (!disposed) setPreferences(value)
    })
    void listenNotificationStateUpdated((update) => {
      if (update.type === "preferences") setPreferences(update.preferences)
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
    previousOutputs.current = outputs
    previousStatuses.current = providerStatuses
    if (events.length === 0) return

    void appendRecentUsageEvents(events).catch((error) => {
      console.error("Failed to persist usage notification events:", error)
    })
    if (!preferences.enabled || isQuietHours(preferences)) return
    void deliverUsageEvents(events)
      .then((delivered) => {
        if (!delivered) setActiveEvents(events)
      })
      .catch((error) => {
        console.error("Failed to deliver usage notification:", error)
        setActiveEvents(events)
      })
  }, [outputs, preferences, providerStatuses])

  return {
    activeEvents,
    dismissNotifications: () => setActiveEvents([]),
  }
}
