import { useEffect, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type UsageEvent,
} from "@/lib/notification-events"
import {
  clearRecentUsageEvents,
  listenNotificationStateUpdated,
  loadNotificationPreferences,
  loadRecentUsageEvents,
  saveNotificationPreferences,
} from "@/lib/notification-settings"

const THRESHOLDS = [50, 75, 90]

export function NotificationSettingsSection({ className }: { className?: string }) {
  const [preferences, setPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES)
  const [events, setEvents] = useState<UsageEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void Promise.all([loadNotificationPreferences(), loadRecentUsageEvents()]).then(
      ([nextPreferences, nextEvents]) => {
        if (disposed) return
        setPreferences(nextPreferences)
        setEvents(nextEvents)
      }
    )
    void listenNotificationStateUpdated((update) => {
      if (update.type === "preferences") setPreferences(update.preferences)
      else setEvents(update.events)
    }).then((dispose) => {
      if (disposed) dispose()
      else unlisten = dispose
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const update = async (next: NotificationPreferences) => {
    setError(null)
    setPreferences(next)
    try {
      await saveNotificationPreferences(next)
    } catch (saveError) {
      console.error("Failed to save notification preferences:", saveError)
      setError("Notification preferences could not be saved.")
    }
  }

  const toggleEnabled = async (enabled: boolean) => {
    if (enabled && isTauri()) {
      try {
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === "granted"
        if (!granted) {
          setError("Windows notification permission was not granted.")
          return
        }
      } catch (permissionError) {
        console.error("Failed to request notification permission:", permissionError)
        setError("Windows notification permission could not be requested.")
        return
      }
    }
    await update({ ...preferences, enabled })
  }

  return (
    <section className={className} aria-labelledby="notification-settings-heading">
      <h3 id="notification-settings-heading" className="mb-0 text-base font-semibold">
        Notifications
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Local quota, reset, and provider-status events. Quiet hours suppress Windows delivery but
        keep events here.
      </p>
      <label className="flex select-none items-center gap-2 text-sm text-foreground">
        <Checkbox
          aria-label="Deliver Windows notifications"
          checked={preferences.enabled}
          onCheckedChange={(checked) => void toggleEnabled(checked === true)}
        />
        Deliver Windows notifications
      </label>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-muted-foreground">Quota thresholds</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {THRESHOLDS.map((threshold) => (
            <label key={threshold} className="flex items-center gap-2 text-sm">
              <Checkbox
                aria-label={`${threshold}% used`}
                checked={preferences.quotaThresholds.includes(threshold)}
                onCheckedChange={(checked) => {
                  const quotaThresholds = checked
                    ? [...preferences.quotaThresholds, threshold].sort((a, b) => a - b)
                    : preferences.quotaThresholds.filter((value) => value !== threshold)
                  void update({ ...preferences, quotaThresholds })
                }}
              />
              {threshold}% used
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Incidents and recovery"
            checked={preferences.incidents}
            onCheckedChange={(checked) =>
              void update({ ...preferences, incidents: checked === true })
            }
          />
          Incidents and recovery
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Quota resets"
            checked={preferences.resets}
            onCheckedChange={(checked) => void update({ ...preferences, resets: checked === true })}
          />
          Quota resets
        </label>
      </div>

      <div className="mt-3 rounded-lg border border-border/60 p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Quiet hours"
            checked={preferences.quietHours.enabled}
            onCheckedChange={(checked) =>
              void update({
                ...preferences,
                quietHours: { ...preferences.quietHours, enabled: checked === true },
              })
            }
          />
          Quiet hours
        </label>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            aria-label="Quiet hours start"
            type="time"
            value={preferences.quietHours.start}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            onChange={(event) =>
              void update({
                ...preferences,
                quietHours: { ...preferences.quietHours, start: event.target.value },
              })
            }
          />
          to
          <input
            aria-label="Quiet hours end"
            type="time"
            value={preferences.quietHours.end}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            onChange={(event) =>
              void update({
                ...preferences,
                quietHours: { ...preferences.quietHours, end: event.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Recent events</h4>
        {events.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void clearRecentUsageEvents()}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {events.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No quota, incident, or reset events yet.
        </p>
      ) : (
        <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto" aria-label="Recent usage events">
          {events.slice(0, 10).map((event) => (
            <li key={event.id} className="border-t border-border/55 pt-2 text-xs">
              <div className="font-medium text-foreground">{event.title}</div>
              <div className="text-muted-foreground">{event.body}</div>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
