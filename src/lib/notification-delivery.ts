import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import type { UsageEvent } from "@/lib/notification-events"

export async function requestNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === "granted"
  return granted
}

export async function deliverUsageEvents(events: UsageEvent[]): Promise<boolean> {
  if (events.length === 0) return true

  try {
    if (!(await requestNotificationPermission())) return false
    for (const event of events) {
      sendNotification({ title: event.title, body: event.body })
    }
    return true
  } catch (error) {
    console.error("Failed to deliver usage notification:", error)
    return false
  }
}
