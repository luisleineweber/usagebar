import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  arePluginSettingsEqualMock,
  disableAutostartMock,
  enableAutostartMock,
  getProbeEligiblePluginIdsMock,
  invokeMock,
  isAutostartEnabledMock,
  isTauriMock,
  loadAutoUpdateIntervalMock,
  loadAccentColorMock,
  loadDisplayModeMock,
  loadGlobalShortcutMock,
  loadMenubarIconStyleMock,
  loadPluginSettingsRecordMock,
  loadResetTimerDisplayModeMock,
  loadStartOnLoginMock,
  loadSurfacePinsMock,
  loadShowHistoryInBarMock,
  loadThemeModeMock,
  loadTimeFormatModeMock,
  migrateLegacyTraySettingsMock,
  normalizePluginSettingsMock,
  savePluginSettingsMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(),
  isAutostartEnabledMock: vi.fn(),
  enableAutostartMock: vi.fn(),
  disableAutostartMock: vi.fn(),
  arePluginSettingsEqualMock: vi.fn(),
  getProbeEligiblePluginIdsMock: vi.fn(),
  loadAutoUpdateIntervalMock: vi.fn(),
  loadAccentColorMock: vi.fn(),
  loadDisplayModeMock: vi.fn(),
  loadGlobalShortcutMock: vi.fn(),
  loadMenubarIconStyleMock: vi.fn(),
  loadPluginSettingsRecordMock: vi.fn(),
  loadResetTimerDisplayModeMock: vi.fn(),
  loadStartOnLoginMock: vi.fn(),
  loadSurfacePinsMock: vi.fn(),
  loadShowHistoryInBarMock: vi.fn(),
  loadThemeModeMock: vi.fn(),
  loadTimeFormatModeMock: vi.fn(),
  migrateLegacyTraySettingsMock: vi.fn(),
  normalizePluginSettingsMock: vi.fn(),
  savePluginSettingsMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: isTauriMock,
}))

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: disableAutostartMock,
  enable: enableAutostartMock,
  isEnabled: isAutostartEnabledMock,
}))

vi.mock("@/lib/settings", () => ({
  arePluginSettingsEqual: arePluginSettingsEqualMock,
  DEFAULT_AUTO_UPDATE_INTERVAL: 15,
  DEFAULT_ACCENT_COLOR: "#86c5ff",
  DEFAULT_DISPLAY_MODE: "left",
  DEFAULT_GLOBAL_SHORTCUT: null,
  DEFAULT_MENUBAR_ICON_STYLE: "provider",
  DEFAULT_SHOW_HISTORY_IN_BAR: true,
  DEFAULT_RESET_TIMER_DISPLAY_MODE: "relative",
  DEFAULT_START_ON_LOGIN: false,
  DEFAULT_SURFACE_PINS: [],
  DEFAULT_THEME_MODE: "system",
  DEFAULT_TIME_FORMAT_MODE: "auto",
  getProbeEligiblePluginIds: getProbeEligiblePluginIdsMock,
  loadAutoUpdateInterval: loadAutoUpdateIntervalMock,
  loadAccentColor: loadAccentColorMock,
  loadDisplayMode: loadDisplayModeMock,
  loadGlobalShortcut: loadGlobalShortcutMock,
  loadMenubarIconStyle: loadMenubarIconStyleMock,
  loadPluginSettingsRecord: loadPluginSettingsRecordMock,
  loadResetTimerDisplayMode: loadResetTimerDisplayModeMock,
  loadStartOnLogin: loadStartOnLoginMock,
  loadSurfacePins: loadSurfacePinsMock,
  loadShowHistoryInBar: loadShowHistoryInBarMock,
  loadThemeMode: loadThemeModeMock,
  loadTimeFormatMode: loadTimeFormatModeMock,
  migrateLegacyTraySettings: migrateLegacyTraySettingsMock,
  normalizePluginSettings: normalizePluginSettingsMock,
  savePluginSettings: savePluginSettingsMock,
}))

import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"

function createArgs() {
  return {
    setPluginSettings: vi.fn(),
    setPluginsMeta: vi.fn(),
    setAutoUpdateInterval: vi.fn(),
    setThemeMode: vi.fn(),
    setAccentColor: vi.fn(),
    setDisplayMode: vi.fn(),
    setResetTimerDisplayMode: vi.fn(),
    setTimeFormatMode: vi.fn(),
    setGlobalShortcut: vi.fn(),
    setStartOnLogin: vi.fn(),
    setMenubarIconStyle: vi.fn(),
    setSurfacePins: vi.fn(),
    setShowHistoryInBar: vi.fn(),
    setLoadingForPlugins: vi.fn(),
    setErrorForPlugins: vi.fn(),
    startBatch: vi.fn().mockResolvedValue(undefined),
  }
}

describe("useSettingsBootstrap", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false)
    invokeMock.mockReset()
    isTauriMock.mockReset()
    isAutostartEnabledMock.mockReset()
    enableAutostartMock.mockReset()
    disableAutostartMock.mockReset()
    arePluginSettingsEqualMock.mockReset()
    getProbeEligiblePluginIdsMock.mockReset()
    loadAutoUpdateIntervalMock.mockReset()
    loadAccentColorMock.mockReset()
    loadDisplayModeMock.mockReset()
    loadGlobalShortcutMock.mockReset()
    loadMenubarIconStyleMock.mockReset()
    loadPluginSettingsRecordMock.mockReset()
    loadResetTimerDisplayModeMock.mockReset()
    loadStartOnLoginMock.mockReset()
    loadSurfacePinsMock.mockReset()
    loadShowHistoryInBarMock.mockReset()
    loadThemeModeMock.mockReset()
    loadTimeFormatModeMock.mockReset()
    migrateLegacyTraySettingsMock.mockReset()
    normalizePluginSettingsMock.mockReset()
    savePluginSettingsMock.mockReset()

    isTauriMock.mockReturnValue(true)
    isAutostartEnabledMock.mockResolvedValue(true)
    invokeMock.mockResolvedValue([
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
        lines: [],
        primaryCandidates: [],
      },
    ])
    loadPluginSettingsRecordMock.mockResolvedValue({
      settings: { order: ["codex"], disabled: [] },
      hasStoredSettings: true,
      onboardingInProgress: false,
    })
    normalizePluginSettingsMock.mockImplementation((stored) => stored)
    arePluginSettingsEqualMock.mockReturnValue(true)
    loadAutoUpdateIntervalMock.mockResolvedValue(15)
    loadAccentColorMock.mockResolvedValue("#86c5ff")
    loadThemeModeMock.mockResolvedValue("dark")
    loadDisplayModeMock.mockResolvedValue("used")
    loadResetTimerDisplayModeMock.mockResolvedValue("relative")
    loadTimeFormatModeMock.mockResolvedValue("auto")
    loadGlobalShortcutMock.mockResolvedValue("CommandOrControl+Shift+O")
    loadMenubarIconStyleMock.mockResolvedValue("provider")
    loadStartOnLoginMock.mockResolvedValue(true)
    loadSurfacePinsMock.mockResolvedValue([])
    loadShowHistoryInBarMock.mockResolvedValue(true)
    migrateLegacyTraySettingsMock.mockResolvedValue(undefined)
    savePluginSettingsMock.mockResolvedValue(undefined)
    getProbeEligiblePluginIdsMock.mockReturnValue(["codex"])
  })

  it("disables autostart when applyStartOnLogin receives false", async () => {
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(false)

    expect(disableAutostartMock).toHaveBeenCalledTimes(1)
    expect(enableAutostartMock).not.toHaveBeenCalled()
  })

  it("refreshes an already-enabled autostart entry for the current executable", async () => {
    isAutostartEnabledMock.mockResolvedValueOnce(true)
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(true)

    expect(enableAutostartMock).toHaveBeenCalledTimes(1)
  })

  it("does not register autostart from a development build", async () => {
    vi.stubEnv("DEV", true)
    const args = createArgs()
    const { result } = renderHook(() => useSettingsBootstrap(args))

    await result.current.applyStartOnLogin(true)

    expect(isAutostartEnabledMock).not.toHaveBeenCalled()
    expect(enableAutostartMock).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
  })

  it("falls back to default reset timer mode when loading fails", async () => {
    const resetModeError = new Error("reset timer mode unavailable")
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    loadResetTimerDisplayModeMock.mockRejectedValueOnce(resetModeError)
    const args = createArgs()

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Failed to load reset timer display mode:",
        resetModeError
      )
      expect(args.setResetTimerDisplayMode).toHaveBeenCalledWith("relative")
    })

    errorSpy.mockRestore()
  })

  it("publishes plugin settings before slower preference loads finish", async () => {
    let resolveStartOnLogin: ((value: boolean) => void) | null = null
    loadStartOnLoginMock.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveStartOnLogin = resolve
      })
    )

    const args = createArgs()
    const normalized = { order: ["codex"], disabled: [] }
    normalizePluginSettingsMock.mockReturnValueOnce(normalized)

    renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(args.setPluginsMeta).toHaveBeenCalledWith([
        {
          id: "codex",
          name: "Codex",
          iconUrl: "/codex.svg",
          brandColor: "#000000",
          lines: [],
          primaryCandidates: [],
        },
      ])
      expect(args.setPluginSettings).toHaveBeenCalledWith(normalized)
    })

    expect(args.setStartOnLogin).not.toHaveBeenCalled()

    resolveStartOnLogin?.(true)

    await waitFor(() => {
      expect(args.setStartOnLogin).toHaveBeenCalledWith(true)
      expect(args.setShowHistoryInBar).toHaveBeenCalledWith(true)
    })
  })

  it("defers persistence and probes when no provider settings exist yet", async () => {
    loadPluginSettingsRecordMock.mockResolvedValueOnce({
      settings: { order: [], disabled: [] },
      hasStoredSettings: false,
      onboardingInProgress: false,
    })
    normalizePluginSettingsMock.mockReturnValueOnce({ order: ["codex"], disabled: [] })
    const args = createArgs()

    const { result } = renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => {
      expect(result.current.isFirstRun).toBe(true)
      expect(args.setPluginSettings).toHaveBeenCalledWith({
        order: ["codex"],
        disabled: [],
      })
    })

    expect(savePluginSettingsMock).not.toHaveBeenCalled()
    expect(args.setLoadingForPlugins).not.toHaveBeenCalled()
    expect(args.startBatch).not.toHaveBeenCalled()
  })

  it("resumes an interrupted onboarding without probing stored providers", async () => {
    loadPluginSettingsRecordMock.mockResolvedValueOnce({
      settings: { order: ["codex"], disabled: [] },
      hasStoredSettings: true,
      onboardingInProgress: true,
    })
    const args = createArgs()

    const { result } = renderHook(() => useSettingsBootstrap(args))

    await waitFor(() => expect(result.current.isFirstRun).toBe(true))
    expect(args.setLoadingForPlugins).not.toHaveBeenCalled()
    expect(args.startBatch).not.toHaveBeenCalled()
  })
})
