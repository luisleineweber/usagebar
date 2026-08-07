import { beforeEach, describe, expect, it, vi } from "vitest"

const { emitMock, getMock, isTauriMock, listenMock, saveMock, setMock } = vi.hoisted(() => ({
  emitMock: vi.fn(),
  getMock: vi.fn(),
  isTauriMock: vi.fn(),
  listenMock: vi.fn(),
  saveMock: vi.fn(),
  setMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }))
vi.mock("@tauri-apps/api/event", () => ({ emit: emitMock, listen: listenMock }))
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = getMock
    save = saveMock
    set = setMock
  },
}))

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  appendRecentUsageEvents,
  clearRecentUsageEvents,
  listenNotificationStateUpdated,
  loadNotificationPreferences,
  loadRecentUsageEvents,
  saveNotificationPreferences,
} from "@/lib/notification-settings"
import type { UsageEvent } from "@/lib/notification-events"

function usageEvent(id: string): UsageEvent {
  return {
    id,
    type: "quota",
    providerId: "claude",
    title: "Claude quota warning",
    body: "Session reached 75% used.",
    createdAt: 10,
  }
}

describe("notification settings", () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(false)
    getMock.mockResolvedValue(undefined)
    setMock.mockResolvedValue(undefined)
    saveMock.mockResolvedValue(undefined)
    emitMock.mockResolvedValue(undefined)
    listenMock.mockResolvedValue(() => {})
  })

  it("returns deterministic defaults without native IPC", async () => {
    await expect(loadNotificationPreferences()).resolves.toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    await expect(loadRecentUsageEvents()).resolves.toEqual([])
    await expect(appendRecentUsageEvents([usageEvent("new")])).resolves.toEqual([])
    await expect(
      saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
    ).resolves.toBeUndefined()
    await expect(clearRecentUsageEvents()).resolves.toBeUndefined()
    expect(getMock).not.toHaveBeenCalled()
  })

  it("loads and normalizes native preferences", async () => {
    isTauriMock.mockReturnValue(true)
    getMock.mockResolvedValue({
      enabled: true,
      quotaThresholds: [90, 75, 90, 0, 100, Number.NaN],
      incidents: false,
      resets: false,
      quietHours: { enabled: true, start: "invalid", end: "07:30" },
    })

    await expect(loadNotificationPreferences()).resolves.toEqual({
      enabled: true,
      quotaThresholds: [75, 90],
      incidents: false,
      resets: false,
      quietHours: { enabled: true, start: "22:00", end: "07:30" },
    })
    expect(getMock).toHaveBeenCalledWith("notificationPreferences")
  })

  it("saves normalized preferences and publishes the requested update", async () => {
    isTauriMock.mockReturnValue(true)
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      enabled: true,
      quotaThresholds: [90, 75, 75],
    }

    await saveNotificationPreferences(preferences)

    expect(setMock).toHaveBeenCalledWith("notificationPreferences", {
      ...preferences,
      quotaThresholds: [75, 90],
    })
    expect(saveMock).toHaveBeenCalledOnce()
    expect(emitMock).toHaveBeenCalledWith("notifications:updated", {
      type: "preferences",
      preferences,
    })
  })

  it("filters malformed stored events and keeps the newest 50", async () => {
    isTauriMock.mockReturnValue(true)
    const valid = Array.from({ length: 51 }, (_, index) => usageEvent(String(index)))
    getMock.mockResolvedValue([
      ...valid,
      null,
      { ...usageEvent("missing-title"), title: undefined },
      { ...usageEvent("bad-date"), createdAt: "today" },
    ])

    const result = await loadRecentUsageEvents()

    expect(result).toHaveLength(50)
    expect(result.at(0)?.id).toBe("0")
    expect(result.at(-1)?.id).toBe("49")
  })

  it("returns an empty list when stored events are not an array", async () => {
    isTauriMock.mockReturnValue(true)
    getMock.mockResolvedValue({ id: "not-an-array" })

    await expect(loadRecentUsageEvents()).resolves.toEqual([])
  })

  it("prepends new unique events, limits storage, and publishes the result", async () => {
    isTauriMock.mockReturnValue(true)
    const current = Array.from({ length: 49 }, (_, index) => usageEvent(`old-${index}`))
    getMock.mockResolvedValue(current)

    const result = await appendRecentUsageEvents([
      usageEvent("new-1"),
      usageEvent("old-1"),
      usageEvent("new-2"),
    ])

    expect(result).toHaveLength(50)
    expect(result.slice(0, 2).map((event) => event.id)).toEqual(["new-1", "new-2"])
    expect(setMock).toHaveBeenCalledWith("recentUsageEvents", result)
    expect(saveMock).toHaveBeenCalledOnce()
    expect(emitMock).toHaveBeenCalledWith("notifications:updated", {
      type: "events",
      events: result,
    })
  })

  it("does not write when every appended event already exists", async () => {
    isTauriMock.mockReturnValue(true)
    getMock.mockResolvedValue([usageEvent("existing")])

    await expect(appendRecentUsageEvents([usageEvent("existing")])).resolves.toEqual([
      usageEvent("existing"),
    ])
    expect(setMock).not.toHaveBeenCalled()
  })

  it("reloads events for an empty append", async () => {
    isTauriMock.mockReturnValue(true)
    getMock.mockResolvedValue([usageEvent("existing")])

    await expect(appendRecentUsageEvents([])).resolves.toEqual([usageEvent("existing")])
    expect(setMock).not.toHaveBeenCalled()
  })

  it("clears native events and publishes the empty list", async () => {
    isTauriMock.mockReturnValue(true)

    await clearRecentUsageEvents()

    expect(setMock).toHaveBeenCalledWith("recentUsageEvents", [])
    expect(saveMock).toHaveBeenCalledOnce()
    expect(emitMock).toHaveBeenCalledWith("notifications:updated", {
      type: "events",
      events: [],
    })
  })

  it("forwards native updates and returns the native disposer", async () => {
    isTauriMock.mockReturnValue(true)
    const dispose = vi.fn()
    listenMock.mockImplementation(async (_eventName, callback) => {
      callback({ payload: { type: "events", events: [usageEvent("received")] } })
      return dispose
    })
    const handler = vi.fn()

    await expect(listenNotificationStateUpdated(handler)).resolves.toBe(dispose)
    expect(listenMock).toHaveBeenCalledWith("notifications:updated", expect.any(Function))
    expect(handler).toHaveBeenCalledWith({ type: "events", events: [usageEvent("received")] })
  })

  it("returns a no-op disposer outside Tauri", async () => {
    const dispose = await listenNotificationStateUpdated(vi.fn())

    expect(dispose()).toBeUndefined()
    expect(listenMock).not.toHaveBeenCalled()
  })

  it("exposes native storage failures and does not publish an incomplete save", async () => {
    isTauriMock.mockReturnValue(true)
    saveMock.mockRejectedValue(new Error("disk full"))

    await expect(saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)).rejects.toThrow(
      "disk full"
    )
    expect(emitMock).not.toHaveBeenCalled()
  })
})
