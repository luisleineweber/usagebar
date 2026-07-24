import { renderHook, act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFirstRunOnboarding } from "@/hooks/app/use-first-run-onboarding"
import type { PluginSettings } from "@/lib/settings"

const {
  getCurrentWindowMock,
  hideMock,
  notifyPluginSettingsUpdatedMock,
  saveOnboardingInProgressMock,
  savePluginSettingsMock,
  showPanelForViewMock,
} = vi.hoisted(() => ({
  getCurrentWindowMock: vi.fn(),
  hideMock: vi.fn(),
  notifyPluginSettingsUpdatedMock: vi.fn(),
  saveOnboardingInProgressMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
  showPanelForViewMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: getCurrentWindowMock,
}))

vi.mock("@/lib/plugin-settings-events", () => ({
  notifyPluginSettingsUpdated: notifyPluginSettingsUpdatedMock,
}))

vi.mock("@/lib/panel-window", () => ({
  showPanelForView: showPanelForViewMock,
}))

vi.mock("@/lib/settings", () => ({
  saveOnboardingInProgress: saveOnboardingInProgressMock,
  savePluginSettings: savePluginSettingsMock,
}))

const pluginSettings: PluginSettings = {
  order: ["codex", "claude", "cursor"],
  disabled: [],
  hidden: ["cursor"],
}

function renderOnboarding(overrides: Partial<Parameters<typeof useFirstRunOnboarding>[0]> = {}) {
  const args = {
    pluginSettings,
    setPluginSettings: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn(async () => ["codex"]),
    scheduleTrayIconUpdate: vi.fn(),
    finishFirstRun: vi.fn(),
    ...overrides,
  }
  return { ...renderHook(() => useFirstRunOnboarding(args)), args }
}

describe("useFirstRunOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hideMock.mockResolvedValue(undefined)
    getCurrentWindowMock.mockReturnValue({ hide: hideMock })
    notifyPluginSettingsUpdatedMock.mockResolvedValue(undefined)
    saveOnboardingInProgressMock.mockResolvedValue(undefined)
    savePluginSettingsMock.mockResolvedValue(undefined)
    showPanelForViewMock.mockResolvedValue(undefined)
  })

  it("persists selected providers and marks unselected providers disabled", async () => {
    const { result, args } = renderOnboarding()

    await act(async () => {
      await result.current.connectProviders(["codex", "missing"])
    })

    expect(savePluginSettingsMock).toHaveBeenCalledWith({
      order: pluginSettings.order,
      disabled: ["claude", "cursor"],
      hidden: ["cursor"],
    })
    expect(args.setLoadingForPlugins).toHaveBeenCalledWith(["codex"])
    expect(args.startBatch).toHaveBeenCalledWith(["codex"])
  })

  it("reports when no onboarding probe starts", async () => {
    const { result, args } = renderOnboarding({
      startBatch: vi.fn(async () => undefined),
    })

    await act(async () => {
      await result.current.connectProviders(["codex"])
    })

    expect(args.setErrorForPlugins).toHaveBeenCalledWith(
      ["codex"],
      expect.stringContaining("Verbindungs")
    )
  })

  it("reports a rejected onboarding probe", async () => {
    const { result, args } = renderOnboarding({
      startBatch: vi.fn(async () => {
        throw new Error("probe failed")
      }),
    })

    await act(async () => {
      await result.current.connectProviders(["codex"])
    })

    expect(args.setErrorForPlugins).toHaveBeenCalledWith(
      ["codex"],
      expect.stringContaining("Verbindungs")
    )
  })

  it("finishes onboarding, hides its window, and opens the home panel", async () => {
    const { result, args } = renderOnboarding()

    await act(async () => {
      await result.current.finishOnboarding()
    })

    expect(notifyPluginSettingsUpdatedMock).toHaveBeenCalledWith(pluginSettings)
    expect(saveOnboardingInProgressMock).toHaveBeenCalledWith(false)
    expect(args.scheduleTrayIconUpdate).toHaveBeenCalledWith("settings", 0)
    expect(args.finishFirstRun).toHaveBeenCalled()
    expect(hideMock).toHaveBeenCalled()
    expect(showPanelForViewMock).toHaveBeenCalledWith("home")
  })

  it("continues finishing when the onboarding window cannot be hidden", async () => {
    hideMock.mockRejectedValue(new Error("window unavailable"))
    const { result } = renderOnboarding()

    await act(async () => {
      await result.current.finishOnboarding()
    })

    expect(showPanelForViewMock).toHaveBeenCalledWith("home")
  })
})
