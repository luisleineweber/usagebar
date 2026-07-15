import { isTauri } from "@tauri-apps/api/core"
import { emit, listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event"
import { LazyStore } from "@tauri-apps/plugin-store"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  type NotificationPreferences,
  type UsageEvent,
} from "@/lib/notification-events"

const store = new LazyStore("settings.json")
const PREFERENCES_KEY = "notificationPreferences"
const EVENTS_KEY = "recentUsageEvents"
const UPDATED_EVENT = "notifications:updated"
const MAX_RECENT_EVENTS = 50

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  if (!isTauri()) return DEFAULT_NOTIFICATION_PREFERENCES
  return normalizeNotificationPreferences(await store.get(PREFERENCES_KEY))
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences
): Promise<void> {
  if (!isTauri()) return
  await store.set(PREFERENCES_KEY, normalizeNotificationPreferences(preferences))
  await store.save()
  await notifyNotificationStateUpdated({ type: "preferences", preferences })
}

export async function loadRecentUsageEvents(): Promise<UsageEvent[]> {
  if (!isTauri()) return []
  const value = await store.get<unknown>(EVENTS_KEY)
  if (!Array.isArray(value)) return []
  return value
    .filter((event): event is UsageEvent => {
      if (!event || typeof event !== "object") return false
      const raw = event as Partial<UsageEvent>
      return (
        typeof raw.id === "string" &&
        typeof raw.providerId === "string" &&
        typeof raw.title === "string" &&
        typeof raw.body === "string" &&
        typeof raw.createdAt === "number"
      )
    })
    .slice(0, MAX_RECENT_EVENTS)
}

export async function appendRecentUsageEvents(events: UsageEvent[]): Promise<UsageEvent[]> {
  if (!isTauri()) return []
  if (events.length === 0) return loadRecentUsageEvents()
  const current = await loadRecentUsageEvents()
  const ids = new Set(current.map((event) => event.id))
  const unique = events.filter((event) => !ids.has(event.id))
  if (unique.length === 0) return current
  const next = [...unique, ...current].slice(0, MAX_RECENT_EVENTS)
  await store.set(EVENTS_KEY, next)
  await store.save()
  await notifyNotificationStateUpdated({ type: "events", events: next })
  return next
}

export async function clearRecentUsageEvents(): Promise<void> {
  if (!isTauri()) return
  await store.set(EVENTS_KEY, [])
  await store.save()
  await notifyNotificationStateUpdated({ type: "events", events: [] })
}

type NotificationStateUpdate =
  | { type: "preferences"; preferences: NotificationPreferences }
  | { type: "events"; events: UsageEvent[] }

async function notifyNotificationStateUpdated(update: NotificationStateUpdate): Promise<void> {
  if (!isTauri()) return
  await emit(UPDATED_EVENT, update)
}

export async function listenNotificationStateUpdated(
  handler: (update: NotificationStateUpdate) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}
  const callback: EventCallback<NotificationStateUpdate> = (event) => handler(event.payload)
  return listen(UPDATED_EVENT, callback)
}

export { DEFAULT_NOTIFICATION_PREFERENCES }
