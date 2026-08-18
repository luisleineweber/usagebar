import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useNotificationEvents } from "@/hooks/app/use-notification-events"
import type { PluginState } from "@/hooks/app/types"
import type { NotificationPreferences } from "@/lib/notification-events"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"

const {
  appendRecentUsageEventsMock,
  deliverUsageEventsMock,
  listenNotificationStateUpdatedMock,
  loadNotificationPreferencesMock,
  loadRecentUsageEventsMock,
} = vi.hoisted(() => ({
  appendRecentUsageEventsMock: vi.fn(),
  deliverUsageEventsMock: vi.fn(),
  listenNotificationStateUpdatedMock: vi.fn(),
  loadNotificationPreferencesMock: vi.fn(),
  loadRecentUsageEventsMock: vi.fn(),
}))

vi.mock("@/lib/notification-delivery", () => ({
  deliverUsageEvents: deliverUsageEventsMock,
}))

vi.mock("@/lib/notification-settings", () => ({
  appendRecentUsageEvents: appendRecentUsageEventsMock,
  listenNotificationStateUpdated: listenNotificationStateUpdatedMock,
  loadNotificationPreferences: loadNotificationPreferencesMock,
  loadRecentUsageEvents: loadRecentUsageEventsMock,
}))

const preferences = {
  enabled: true,
  quotaThresholds: [75, 90],
  incidents: true,
  resets: true,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
}

const pluginsMeta: PluginMeta[] = [
  {
    id: "claude",
    name: "Claude",
    iconUrl: "/claude.svg",
    lines: [{ type: "progress", label: "Session", scope: "overview" }],
    primaryCandidates: ["Session"],
  },
]

function output(used: number, resetsAt = "2026-07-14T00:00:00Z"): PluginOutput {
  return {
    providerId: "claude",
    displayName: "Claude",
    lines: [
      {
        type: "progress",
        label: "Session",
        used,
        limit: 100,
        format: { kind: "percent" },
        resetsAt,
      },
    ],
    iconUrl: "/claude.svg",
  }
}

function pluginState(data: PluginOutput): PluginState {
  return {
    data,
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastSuccessAt: 1,
  }
}

describe("useNotificationEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadNotificationPreferencesMock.mockResolvedValue(preferences)
    loadRecentUsageEventsMock.mockResolvedValue([])
    listenNotificationStateUpdatedMock.mockResolvedValue(() => {})
    appendRecentUsageEventsMock.mockResolvedValue([])
    deliverUsageEventsMock.mockResolvedValue(false)
  })

  it("shows an in-app fallback when native delivery fails", async () => {
    const { result, rerender } = renderHook(
      ({ used }: { used: number }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70 } }
    )

    await waitFor(() => expect(loadNotificationPreferencesMock).toHaveBeenCalledOnce())
    rerender({ used: 80 })

    await waitFor(() => expect(result.current.activeEvents).toHaveLength(1))
    expect(deliverUsageEventsMock).toHaveBeenCalledWith([
      expect.objectContaining({ type: "quota", providerId: "claude" }),
    ])
  })

  it("does not show the fallback after native delivery succeeds", async () => {
    deliverUsageEventsMock.mockResolvedValue(true)
    const { result, rerender } = renderHook(
      ({ used }: { used: number }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70 } }
    )

    await waitFor(() => expect(loadNotificationPreferencesMock).toHaveBeenCalledOnce())
    rerender({ used: 80 })

    await waitFor(() => expect(deliverUsageEventsMock).toHaveBeenCalledOnce())
    expect(result.current.activeEvents).toEqual([])
  })

  it("shows and dismisses the fallback when native delivery rejects", async () => {
    const deliveryError = new Error("toast failed")
    const persistenceError = new Error("store failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    deliverUsageEventsMock.mockRejectedValue(deliveryError)
    appendRecentUsageEventsMock.mockRejectedValue(persistenceError)
    const { result, rerender } = renderHook(
      ({ used }: { used: number }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70 } }
    )

    await waitFor(() => expect(loadNotificationPreferencesMock).toHaveBeenCalledOnce())
    rerender({ used: 80 })
    await waitFor(() => expect(result.current.activeEvents).toHaveLength(1))
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to persist usage notification events:",
      persistenceError
    )
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to deliver usage notification:",
      deliveryError
    )

    act(() => result.current.dismissNotifications())
    expect(result.current.activeEvents).toEqual([])
  })

  it("plays a quota warning only once before the provider reset", async () => {
    loadNotificationPreferencesMock.mockResolvedValue({ ...preferences, resets: false })
    const { rerender } = renderHook(
      ({ used, resetsAt }: { used: number; resetsAt: string }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used, resetsAt)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70, resetsAt: "2026-07-14T00:00:00Z" } }
    )

    await waitFor(() => expect(loadNotificationPreferencesMock).toHaveBeenCalledOnce())
    rerender({ used: 80, resetsAt: "2026-07-14T00:00:00Z" })
    await waitFor(() => expect(deliverUsageEventsMock).toHaveBeenCalledOnce())

    rerender({ used: 70, resetsAt: "2026-07-14T00:00:00Z" })
    rerender({ used: 80, resetsAt: "2026-07-14T00:00:00Z" })
    rerender({ used: 70, resetsAt: "2026-07-21T00:00:00Z" })
    rerender({ used: 80, resetsAt: "2026-07-21T00:00:00Z" })
    await waitFor(() => expect(deliverUsageEventsMock).toHaveBeenCalledTimes(2))
    expect(deliverUsageEventsMock).toHaveBeenCalledTimes(2)
  })

  it("does not replay a stored usage event after a provider reload", async () => {
    loadRecentUsageEventsMock.mockResolvedValue([
      {
        id: "quota:claude:session:75:2026-07-14T00:00:00Z",
        type: "quota",
        providerId: "claude",
        title: "Claude quota warning",
        body: "Session reached 80% used.",
        createdAt: 1,
      },
    ])
    const { rerender } = renderHook(
      ({ used }: { used: number }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70 } }
    )

    await waitFor(() => expect(loadRecentUsageEventsMock).toHaveBeenCalledOnce())
    rerender({ used: 80 })
    await waitFor(() => expect(appendRecentUsageEventsMock).toHaveBeenCalledOnce())
    expect(deliverUsageEventsMock).not.toHaveBeenCalled()
  })

  it("updates preferences from notification events and skips disabled delivery", async () => {
    let stateHandler!: (update: { type: string; preferences: NotificationPreferences }) => void
    const dispose = vi.fn()
    listenNotificationStateUpdatedMock.mockImplementation(async (handler) => {
      stateHandler = handler
      return dispose
    })
    const { rerender, unmount } = renderHook(
      ({ used }: { used: number }) =>
        useNotificationEvents({
          pluginStates: { claude: pluginState(output(used)) },
          providerStatuses: {},
          pluginsMeta,
        }),
      { initialProps: { used: 70 } }
    )
    await waitFor(() => expect(listenNotificationStateUpdatedMock).toHaveBeenCalledOnce())

    act(() => {
      stateHandler({ type: "refresh", preferences })
      stateHandler({ type: "preferences", preferences: { ...preferences, enabled: false } })
    })
    rerender({ used: 80 })
    await waitFor(() => expect(appendRecentUsageEventsMock).toHaveBeenCalledOnce())
    expect(deliverUsageEventsMock).not.toHaveBeenCalled()

    unmount()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
