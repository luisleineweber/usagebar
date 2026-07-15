import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  appendRecentUsageEvents,
  clearRecentUsageEvents,
  loadNotificationPreferences,
  loadRecentUsageEvents,
  saveNotificationPreferences,
} from "@/lib/notification-settings"

describe("notification settings outside Tauri", () => {
  it("returns deterministic defaults without native IPC", async () => {
    await expect(loadNotificationPreferences()).resolves.toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    await expect(loadRecentUsageEvents()).resolves.toEqual([])
  })

  it("does not access native storage when saving or clearing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)).resolves.toBeUndefined()
    await expect(appendRecentUsageEvents([])).resolves.toEqual([])
    await expect(clearRecentUsageEvents()).resolves.toBeUndefined()

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
