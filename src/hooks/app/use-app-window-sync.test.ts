import { act, renderHook, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DisplayPreferenceUpdate } from "@/lib/display-preference-events"
import type { PluginSettings } from "@/lib/settings"

const { listenDisplayPreferenceUpdatedMock, listenPluginSettingsUpdatedMock } = vi.hoisted(() => ({
  listenDisplayPreferenceUpdatedMock: vi.fn(),
  listenPluginSettingsUpdatedMock: vi.fn(),
}))

vi.mock("@/lib/display-preference-events", () => ({
  listenDisplayPreferenceUpdated: listenDisplayPreferenceUpdatedMock,
}))
vi.mock("@/lib/plugin-settings-events", () => ({
  listenPluginSettingsUpdated: listenPluginSettingsUpdatedMock,
}))

import { useAppWindowSync } from "@/hooks/app/use-app-window-sync"

describe("useAppWindowSync", () => {
  beforeEach(() => {
    listenPluginSettingsUpdatedMock.mockResolvedValue(vi.fn())
    listenDisplayPreferenceUpdatedMock.mockResolvedValue(vi.fn())
  })

  function setup() {
    const finishFirstRun = vi.fn()
    const finishFirstRunRef = createRef<() => void>()
    finishFirstRunRef.current = finishFirstRun
    const actions = {
      setPluginSettings: vi.fn(),
      scheduleTrayIconUpdate: vi.fn(),
      setThemeMode: vi.fn(),
      setAccentColor: vi.fn(),
      setDisplayMode: vi.fn(),
      setResetTimerDisplayMode: vi.fn(),
      setTimeFormatMode: vi.fn(),
      setSurfacePins: vi.fn(),
      setMenubarIconStyle: vi.fn(),
      setTrayProviderSelection: vi.fn(),
      setShowHistoryInBar: vi.fn(),
    }
    const hook = renderHook(() => useAppWindowSync({ finishFirstRunRef, ...actions }))
    return { ...hook, actions, finishFirstRun }
  }

  it("synchronizes plugin settings and each display preference", async () => {
    let pluginHandler!: (settings: PluginSettings) => void
    let displayHandler!: (update: DisplayPreferenceUpdate) => void
    listenPluginSettingsUpdatedMock.mockImplementation(async (handler) => {
      pluginHandler = handler
      return vi.fn()
    })
    listenDisplayPreferenceUpdatedMock.mockImplementation(async (handler) => {
      displayHandler = handler
      return vi.fn()
    })
    const { actions, finishFirstRun } = setup()
    await waitFor(() => expect(listenDisplayPreferenceUpdatedMock).toHaveBeenCalledOnce())

    const settings = { order: ["codex"], disabled: [] } as PluginSettings
    act(() => pluginHandler(settings))
    expect(finishFirstRun).toHaveBeenCalledOnce()
    expect(actions.setPluginSettings).toHaveBeenCalledWith(settings)

    const updates: DisplayPreferenceUpdate[] = [
      { key: "themeMode", value: "dark" },
      { key: "accentColor", value: "#86c5ff" },
      { key: "displayMode", value: "used" },
      { key: "resetTimerDisplayMode", value: "absolute" },
      { key: "timeFormatMode", value: "24h" },
      {
        key: "surfacePins",
        value: [{ providerId: "codex", metricLabel: "5h", presentation: "bar" }],
      },
      { key: "showHistoryInBar", value: true },
      { key: "trayProviderSelection", value: "first" },
      { key: "menubarIconStyle", value: "donut" },
    ]
    act(() => updates.forEach(displayHandler))

    expect(actions.setThemeMode).toHaveBeenCalledWith("dark")
    expect(actions.setAccentColor).toHaveBeenCalledWith("#86c5ff")
    expect(actions.setDisplayMode).toHaveBeenCalledWith("used")
    expect(actions.setResetTimerDisplayMode).toHaveBeenCalledWith("absolute")
    expect(actions.setTimeFormatMode).toHaveBeenCalledWith("24h")
    expect(actions.setSurfacePins).toHaveBeenCalledWith([
      { providerId: "codex", metricLabel: "5h", presentation: "bar" },
    ])
    expect(actions.setShowHistoryInBar).toHaveBeenCalledWith(true)
    expect(actions.setTrayProviderSelection).toHaveBeenCalledWith("first")
    expect(actions.setMenubarIconStyle).toHaveBeenCalledWith("donut")
    expect(actions.scheduleTrayIconUpdate).toHaveBeenCalledTimes(6)
  })

  it("disposes listeners after unmount, including listeners that resolve late", async () => {
    let resolvePlugin!: (dispose: () => void) => void
    const latePlugin = new Promise<() => void>((resolve) => {
      resolvePlugin = resolve
    })
    const pluginDispose = vi.fn()
    const displayDispose = vi.fn()
    listenPluginSettingsUpdatedMock.mockReturnValue(latePlugin)
    listenDisplayPreferenceUpdatedMock.mockResolvedValue(displayDispose)
    const { unmount } = setup()
    await waitFor(() => expect(listenDisplayPreferenceUpdatedMock).toHaveBeenCalledOnce())

    unmount()
    await act(async () => resolvePlugin(pluginDispose))

    expect(pluginDispose).toHaveBeenCalledOnce()
    expect(displayDispose).toHaveBeenCalledOnce()
  })

  it("reports listener setup failures", async () => {
    const error = new Error("listen failed")
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    listenPluginSettingsUpdatedMock.mockRejectedValue(error)
    listenDisplayPreferenceUpdatedMock.mockRejectedValue(error)
    setup()

    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2))
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to listen for plugin settings updates:",
      error
    )
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to listen for display preference updates:",
      error
    )
  })
})
