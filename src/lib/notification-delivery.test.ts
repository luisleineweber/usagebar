import { beforeEach, describe, expect, it, vi } from "vitest"

const { isPermissionGrantedMock, requestPermissionMock, sendNotificationMock } = vi.hoisted(() => ({
  isPermissionGrantedMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
  sendNotification: sendNotificationMock,
}))

import { deliverUsageEvents, requestNotificationPermission } from "@/lib/notification-delivery"
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

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isPermissionGrantedMock.mockResolvedValue(true)
    requestPermissionMock.mockResolvedValue("granted")
    sendNotificationMock.mockImplementation(() => undefined)
  })

  it("sends every usage event after permission is granted", async () => {
    await expect(deliverUsageEvents([usageEvent("one"), usageEvent("two")])).resolves.toBe(true)

    expect(sendNotificationMock).toHaveBeenNthCalledWith(1, {
      title: "Claude quota warning",
      body: "Session reached 75% used.",
    })
    expect(sendNotificationMock).toHaveBeenCalledTimes(2)
  })

  it("requests permission when Windows has not granted it", async () => {
    isPermissionGrantedMock.mockResolvedValue(false)

    await expect(requestNotificationPermission()).resolves.toBe(true)

    expect(requestPermissionMock).toHaveBeenCalledOnce()
  })

  it("reports a permission failure so the caller can show a fallback", async () => {
    isPermissionGrantedMock.mockResolvedValue(false)
    requestPermissionMock.mockResolvedValue("denied")

    await expect(deliverUsageEvents([usageEvent("denied")])).resolves.toBe(false)

    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it("reports native delivery errors so the caller can show a fallback", async () => {
    sendNotificationMock.mockImplementation(() => {
      throw new Error("native notification failed")
    })
    vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(deliverUsageEvents([usageEvent("error")])).resolves.toBe(false)
  })

})
