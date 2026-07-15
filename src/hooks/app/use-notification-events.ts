import { useEffect, useMemo, useRef, useState } from "react"
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deriveUsageEvents,
  isQuietHours,
  type NotificationPreferences,
} from "@/lib/notification-events"
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
    void isPermissionGranted()
      .then((granted) => {
        if (!granted) return
        for (const event of events) sendNotification({ title: event.title, body: event.body })
      })
      .catch((error) => console.error("Failed to deliver usage notification:", error))
  }, [outputs, preferences, providerStatuses])
}
