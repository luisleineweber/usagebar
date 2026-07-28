import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_PLUGIN_SETTINGS,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_SHOW_HISTORY_IN_BAR,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  arePluginSettingsEqual,
  getEnabledPluginIds,
  loadAutoUpdateInterval,
  loadAccentColor,
  loadDisplayMode,
  loadGlobalShortcut,
  loadMenubarIconStyle,
  loadPluginSettings,
  loadPluginSettingsRecord,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  loadSurfacePins,
  loadShowHistoryInBar,
  migrateLegacyTraySettings,
  loadThemeMode,
  loadTimeFormatMode,
  normalizePluginSettings,
  normalizeSurfacePins,
  saveAutoUpdateInterval,
  saveAccentColor,
  saveDisplayMode,
  saveGlobalShortcut,
  saveMenubarIconStyle,
  saveOnboardingInProgress,
  savePluginSettings,
  saveResetTimerDisplayMode,
  saveStartOnLogin,
  saveSurfacePins,
  saveShowHistoryInBar,
  saveThemeMode,
  saveTimeFormatMode,
} from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"

const storeState = new Map<string, unknown>()
const storeDeleteMock = vi.fn()
const storeSaveMock = vi.fn()

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get<T>(key: string): Promise<T | null> {
      if (!storeState.has(key)) return undefined as T | null
      return storeState.get(key) as T | null
    }
    async set<T>(key: string, value: T): Promise<void> {
      storeState.set(key, value)
    }
    async delete(key: string): Promise<void> {
      storeDeleteMock(key)
      storeState.delete(key)
    }
    async save(): Promise<void> {
      storeSaveMock()
    }
  },
}))

describe("settings", () => {
  beforeEach(() => {
    storeState.clear()
    storeDeleteMock.mockReset()
    storeSaveMock.mockReset()
  })

  it("loads defaults when no settings stored", async () => {
    await expect(loadPluginSettings()).resolves.toEqual(DEFAULT_PLUGIN_SETTINGS)
    await expect(loadPluginSettingsRecord()).resolves.toEqual({
      settings: DEFAULT_PLUGIN_SETTINGS,
      hasStoredSettings: false,
      onboardingInProgress: false,
    })
  })

  it("sanitizes stored settings", async () => {
    storeState.set("plugins", { order: ["a"], disabled: "nope" })
    await expect(loadPluginSettings()).resolves.toEqual({
      order: ["a"],
      disabled: [],
    })
  })

  it("saves settings", async () => {
    const settings = { order: ["a"], disabled: ["b"] }
    await savePluginSettings(settings)
    await expect(loadPluginSettings()).resolves.toEqual(settings)
    await expect(loadPluginSettingsRecord()).resolves.toEqual({
      settings,
      hasStoredSettings: true,
      onboardingInProgress: false,
    })
  })

  it("tracks an interrupted first-run flow separately from existing settings", async () => {
    await savePluginSettings({ order: ["codex"], disabled: [] })
    await saveOnboardingInProgress(true)

    await expect(loadPluginSettingsRecord()).resolves.toEqual({
      settings: { order: ["codex"], disabled: [] },
      hasStoredSettings: true,
      onboardingInProgress: true,
    })
  })

  it("normalizes surface pins against provider progress metrics and caps them at two", () => {
    const plugins: PluginMeta[] = [
      {
        id: "codex",
        name: "Codex",
        iconUrl: "codex.svg",
        lines: [
          { type: "progress", label: "Session", scope: "overview" },
          { type: "text", label: "Plan", scope: "detail" },
        ],
        primaryCandidates: ["Session"],
      },
      {
        id: "claude",
        name: "Claude",
        iconUrl: "claude.svg",
        lines: [{ type: "progress", label: "Weekly", scope: "overview" }],
        primaryCandidates: ["Weekly"],
      },
    ]

    expect(
      normalizeSurfacePins(
        [
          { providerId: "codex", metricLabel: "Session", presentation: "text" },
          { providerId: "codex", metricLabel: "Session", presentation: "bar" },
          { providerId: "codex", metricLabel: "Plan", presentation: "bar" },
          { providerId: "claude", metricLabel: "Weekly", presentation: "bar" },
          { providerId: "missing", metricLabel: "Usage", presentation: "bar" },
        ],
        plugins
      )
    ).toEqual([
      { providerId: "codex", metricLabel: "Session", presentation: "text" },
      { providerId: "claude", metricLabel: "Weekly", presentation: "bar" },
    ])
  })

  it("loads and saves normalized surface pins", async () => {
    const plugins: PluginMeta[] = [
      {
        id: "codex",
        name: "Codex",
        iconUrl: "codex.svg",
        lines: [{ type: "progress", label: "Session", scope: "overview" }],
        primaryCandidates: ["Session"],
      },
    ]
    storeState.set("surfacePins", [
      { providerId: "codex", metricLabel: "Session", presentation: "text" },
      { providerId: "codex", metricLabel: "Unknown", presentation: "bar" },
    ])

    await expect(loadSurfacePins(plugins)).resolves.toEqual([
      { providerId: "codex", metricLabel: "Session", presentation: "text" },
    ])
    await saveSurfacePins([
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
      { providerId: "claude", metricLabel: "Weekly", presentation: "bar" },
      { providerId: "cursor", metricLabel: "Requests", presentation: "bar" },
    ])
    expect(storeState.get("surfacePins")).toEqual([
      { providerId: "codex", metricLabel: "Session", presentation: "bar" },
      { providerId: "claude", metricLabel: "Weekly", presentation: "bar" },
    ])
  })

  it("normalizes order + disabled against known plugins", () => {
    const plugins: PluginMeta[] = [
      { id: "a", name: "A", iconUrl: "", lines: [] },
      { id: "b", name: "B", iconUrl: "", lines: [] },
    ]
    const normalized = normalizePluginSettings(
      { order: ["b", "b", "c"], disabled: ["c", "a"] },
      plugins
    )
    expect(normalized).toEqual({ order: ["b", "a"], disabled: ["a"] })
  })

  it("auto-disables new non-default plugins", () => {
    const plugins: PluginMeta[] = [
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "copilot", name: "Copilot", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
    ]
    const result = normalizePluginSettings({ order: [], disabled: [] }, plugins)
    expect(result.order).toEqual(["claude", "copilot", "windsurf"])
    expect(result.disabled).toEqual(["copilot", "windsurf"])
  })

  it("keeps Codex, Claude, and Cursor first, then sorts remaining providers alphabetically on first run", () => {
    const plugins: PluginMeta[] = [
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "copilot", name: "Copilot", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "abacus", name: "Abacus", iconUrl: "", lines: [], primaryCandidates: [] },
    ]
    const result = normalizePluginSettings({ order: [], disabled: [] }, plugins)
    expect(result.order).toEqual(["codex", "claude", "cursor", "abacus", "copilot", "windsurf"])
  })

  it("preserves a saved provider order during restart normalization", () => {
    const plugins: PluginMeta[] = [
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "copilot", name: "Copilot", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "abacus", name: "Abacus", iconUrl: "", lines: [], primaryCandidates: [] },
    ]
    const result = normalizePluginSettings(
      { order: ["windsurf", "cursor", "claude", "codex", "copilot", "abacus"], disabled: [] },
      plugins
    )
    expect(result.order).toEqual(["windsurf", "cursor", "claude", "codex", "copilot", "abacus"])
  })

  it("appends new providers after saved provider order during update normalization", () => {
    const plugins: PluginMeta[] = [
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "copilot", name: "Copilot", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
    ]
    const result = normalizePluginSettings(
      { order: ["cursor", "codex", "claude"], disabled: [] },
      plugins
    )
    expect(result.order).toEqual(["cursor", "codex", "claude", "copilot", "windsurf"])
    expect(result.disabled).toEqual(["copilot", "windsurf"])
  })

  it("inserts a new provider at its default position instead of appending it", () => {
    const plugins: PluginMeta[] = [
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "copilot", name: "Copilot", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "qwen", name: "Qwen Code", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
    ]
    const result = normalizePluginSettings(
      { order: ["codex", "claude", "cursor", "copilot", "windsurf"], disabled: [] },
      plugins
    )
    expect(result.order).toEqual(["codex", "claude", "cursor", "copilot", "qwen", "windsurf"])
    expect(result.disabled).toContain("qwen")
  })

  it("keeps the four primary providers before the alphabetical remainder", () => {
    const plugins: PluginMeta[] = [
      { id: "windsurf", name: "Windsurf", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "opencode", name: "OpenCode", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "qwen", name: "Qwen Code", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
    ]

    expect(normalizePluginSettings({ order: [], disabled: [] }, plugins).order).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "qwen",
      "windsurf",
    ])
  })

  it("repairs the old Alpha 6 Qwen-at-end default order", () => {
    const plugins: PluginMeta[] = [
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "opencode", name: "OpenCode", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "perplexity", name: "Perplexity", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "qwen", name: "Qwen Code", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "synthetic", name: "Synthetic", iconUrl: "", lines: [], primaryCandidates: [] },
    ]

    const result = normalizePluginSettings(
      {
        order: ["codex", "claude", "cursor", "opencode", "perplexity", "synthetic", "qwen"],
        disabled: [],
      },
      plugins
    )

    expect(result.order).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "perplexity",
      "qwen",
      "synthetic",
    ])
  })

  it("repairs the old order when saved hidden providers are present", () => {
    const plugins: PluginMeta[] = [
      { id: "codex", name: "Codex", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "claude", name: "Claude", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "cursor", name: "Cursor", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "opencode", name: "OpenCode", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "perplexity", name: "Perplexity", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "qwen", name: "Qwen Code", iconUrl: "", lines: [], primaryCandidates: [] },
      { id: "synthetic", name: "Synthetic", iconUrl: "", lines: [], primaryCandidates: [] },
    ]

    const result = normalizePluginSettings(
      {
        order: [
          "codex",
          "claude",
          "cursor",
          "opencode",
          "hidden-provider",
          "perplexity",
          "synthetic",
          "qwen",
        ],
        disabled: [],
      },
      plugins
    )

    expect(result.order).toEqual([
      "codex",
      "claude",
      "cursor",
      "opencode",
      "perplexity",
      "qwen",
      "synthetic",
    ])
  })

  it("compares settings equality", () => {
    const a = { order: ["a"], disabled: [] }
    const b = { order: ["a"], disabled: [] }
    const c = { order: ["b"], disabled: [] }
    expect(arePluginSettingsEqual(a, b)).toBe(true)
    expect(arePluginSettingsEqual(a, c)).toBe(false)
  })

  it("returns enabled plugin ids", () => {
    expect(getEnabledPluginIds({ order: ["a", "b"], disabled: ["b"] })).toEqual(["a"])
  })

  it("loads default auto-update interval when missing", async () => {
    await expect(loadAutoUpdateInterval()).resolves.toBe(DEFAULT_AUTO_UPDATE_INTERVAL)
  })

  it("loads stored auto-update interval", async () => {
    storeState.set("autoUpdateInterval", 30)
    await expect(loadAutoUpdateInterval()).resolves.toBe(30)
  })

  it("saves auto-update interval", async () => {
    await saveAutoUpdateInterval(5)
    await expect(loadAutoUpdateInterval()).resolves.toBe(5)
  })

  it("loads default theme mode when missing", async () => {
    await expect(loadThemeMode()).resolves.toBe(DEFAULT_THEME_MODE)
  })

  it("loads stored theme mode", async () => {
    storeState.set("themeMode", "dark")
    await expect(loadThemeMode()).resolves.toBe("dark")
  })

  it("saves theme mode", async () => {
    await saveThemeMode("light")
    await expect(loadThemeMode()).resolves.toBe("light")
  })

  it("falls back to default for invalid theme mode", async () => {
    storeState.set("themeMode", "invalid")
    await expect(loadThemeMode()).resolves.toBe(DEFAULT_THEME_MODE)
  })

  it("loads and saves the selected accent color", async () => {
    await expect(loadAccentColor()).resolves.toBe(DEFAULT_ACCENT_COLOR)

    await saveAccentColor("#c1121f")

    await expect(loadAccentColor()).resolves.toBe("#c1121f")
  })

  it("falls back to the default for an invalid accent color", async () => {
    storeState.set("accentColor", "#ffffff")

    await expect(loadAccentColor()).resolves.toBe(DEFAULT_ACCENT_COLOR)
  })

  it("loads default display mode when missing", async () => {
    await expect(loadDisplayMode()).resolves.toBe(DEFAULT_DISPLAY_MODE)
  })

  it("loads stored display mode", async () => {
    storeState.set("displayMode", "left")
    await expect(loadDisplayMode()).resolves.toBe("left")
  })

  it("saves display mode", async () => {
    await saveDisplayMode("left")
    await expect(loadDisplayMode()).resolves.toBe("left")
  })

  it("falls back to default for invalid display mode", async () => {
    storeState.set("displayMode", "invalid")
    await expect(loadDisplayMode()).resolves.toBe(DEFAULT_DISPLAY_MODE)
  })

  it("loads default reset timer display mode when missing", async () => {
    await expect(loadResetTimerDisplayMode()).resolves.toBe(DEFAULT_RESET_TIMER_DISPLAY_MODE)
  })

  it("loads stored reset timer display mode", async () => {
    storeState.set("resetTimerDisplayMode", "absolute")
    await expect(loadResetTimerDisplayMode()).resolves.toBe("absolute")
  })

  it("saves reset timer display mode", async () => {
    await saveResetTimerDisplayMode("relative")
    await expect(loadResetTimerDisplayMode()).resolves.toBe("relative")
  })

  it("falls back to default for invalid reset timer display mode", async () => {
    storeState.set("resetTimerDisplayMode", "invalid")
    await expect(loadResetTimerDisplayMode()).resolves.toBe(DEFAULT_RESET_TIMER_DISPLAY_MODE)
  })

  it("migrates and removes legacy tray settings keys", async () => {
    storeState.set("trayIconStyle", "provider")
    storeState.set("trayShowPercentage", false)

    await migrateLegacyTraySettings()

    expect(storeState.has("trayIconStyle")).toBe(false)
    expect(storeState.has("trayShowPercentage")).toBe(false)
  })

  it("migrates legacy trayIconStyle=bars to menubarIconStyle=bars when new key not set", async () => {
    storeState.set("trayIconStyle", "bars")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("bars")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("does not overwrite menubarIconStyle when already set during legacy migration", async () => {
    storeState.set("trayIconStyle", "bars")
    storeState.set("menubarIconStyle", "provider")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("provider")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("migrates legacy trayIconStyle=circle to menubarIconStyle=donut when new key not set", async () => {
    storeState.set("trayIconStyle", "circle")

    await migrateLegacyTraySettings()

    expect(storeState.get("menubarIconStyle")).toBe("donut")
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("does not set menubarIconStyle when legacy trayIconStyle is non-bars", async () => {
    storeState.set("trayIconStyle", "provider")

    await migrateLegacyTraySettings()

    expect(storeState.has("menubarIconStyle")).toBe(false)
    expect(storeState.has("trayIconStyle")).toBe(false)
  })

  it("loads default menubar icon style when missing", async () => {
    await expect(loadMenubarIconStyle()).resolves.toBe(DEFAULT_MENUBAR_ICON_STYLE)
  })

  it("loads stored menubar icon style", async () => {
    storeState.set("menubarIconStyle", "bars")
    await expect(loadMenubarIconStyle()).resolves.toBe("bars")
  })

  it("saves menubar icon style", async () => {
    await saveMenubarIconStyle("bars")
    await expect(loadMenubarIconStyle()).resolves.toBe("bars")
  })

  it("loads stored menubar donut icon style", async () => {
    storeState.set("menubarIconStyle", "donut")
    await expect(loadMenubarIconStyle()).resolves.toBe("donut")
  })

  it("saves menubar donut icon style", async () => {
    await saveMenubarIconStyle("donut")
    await expect(loadMenubarIconStyle()).resolves.toBe("donut")
  })

  it("falls back to default for invalid menubar icon style", async () => {
    storeState.set("menubarIconStyle", "invalid")
    await expect(loadMenubarIconStyle()).resolves.toBe(DEFAULT_MENUBAR_ICON_STYLE)
  })

  it("loads and saves History visibility with an enabled default", async () => {
    await expect(loadShowHistoryInBar()).resolves.toBe(DEFAULT_SHOW_HISTORY_IN_BAR)

    await saveShowHistoryInBar(false)

    await expect(loadShowHistoryInBar()).resolves.toBe(false)
  })

  it("skips legacy tray migration when keys are absent", async () => {
    await expect(migrateLegacyTraySettings()).resolves.toBeUndefined()
    expect(storeState.has("trayIconStyle")).toBe(false)
    expect(storeState.has("trayShowPercentage")).toBe(false)
    expect(storeDeleteMock).not.toHaveBeenCalled()
    expect(storeSaveMock).not.toHaveBeenCalled()
  })

  it("migrates when only one legacy tray key is present", async () => {
    storeState.set("trayShowPercentage", true)

    await migrateLegacyTraySettings()

    expect(storeState.has("trayShowPercentage")).toBe(false)
    expect(storeDeleteMock).toHaveBeenCalledWith("trayShowPercentage")
    expect(storeSaveMock).toHaveBeenCalledTimes(1)
  })

  it("falls back to nulling legacy keys if delete is unavailable", async () => {
    const { LazyStore } = await import("@tauri-apps/plugin-store")
    const prototype = LazyStore.prototype as { delete?: (key: string) => Promise<void> }
    const originalDelete = prototype.delete

    // Simulate older store implementation with no delete() method.
    prototype.delete = undefined
    storeState.set("trayIconStyle", "provider")

    try {
      await migrateLegacyTraySettings()
    } finally {
      prototype.delete = originalDelete
    }

    expect(storeDeleteMock).not.toHaveBeenCalled()
    expect(storeState.get("trayIconStyle")).toBeNull()
    expect(storeSaveMock).toHaveBeenCalledTimes(1)
  })

  it("loads default global shortcut when missing", async () => {
    await expect(loadGlobalShortcut()).resolves.toBe(DEFAULT_GLOBAL_SHORTCUT)
  })

  it("loads stored global shortcut values", async () => {
    storeState.set("globalShortcut", "CommandOrControl+Shift+O")
    await expect(loadGlobalShortcut()).resolves.toBe("CommandOrControl+Shift+O")

    storeState.set("globalShortcut", null)
    await expect(loadGlobalShortcut()).resolves.toBe(null)
  })

  it("falls back to default for invalid global shortcut values", async () => {
    storeState.set("globalShortcut", 1234)
    await expect(loadGlobalShortcut()).resolves.toBe(DEFAULT_GLOBAL_SHORTCUT)
  })

  it("saves global shortcut values", async () => {
    await saveGlobalShortcut("CommandOrControl+Shift+O")
    await expect(loadGlobalShortcut()).resolves.toBe("CommandOrControl+Shift+O")
  })

  it("loads default start on login when missing", async () => {
    await expect(loadStartOnLogin()).resolves.toBe(DEFAULT_START_ON_LOGIN)
  })

  it("loads stored start on login value", async () => {
    storeState.set("startOnLogin", true)
    await expect(loadStartOnLogin()).resolves.toBe(true)
  })

  it("saves start on login value", async () => {
    await saveStartOnLogin(true)
    await expect(loadStartOnLogin()).resolves.toBe(true)
  })

  it("falls back to default for invalid start on login value", async () => {
    storeState.set("startOnLogin", "invalid")
    await expect(loadStartOnLogin()).resolves.toBe(DEFAULT_START_ON_LOGIN)
  })

  it("loads default time format mode when missing", async () => {
    await expect(loadTimeFormatMode()).resolves.toBe(DEFAULT_TIME_FORMAT_MODE)
  })

  it("loads stored time format mode", async () => {
    storeState.set("timeFormatMode", "24h")
    await expect(loadTimeFormatMode()).resolves.toBe("24h")
  })

  it("saves time format mode", async () => {
    await saveTimeFormatMode("12h")
    await expect(loadTimeFormatMode()).resolves.toBe("12h")
  })

  it("falls back to default for invalid time format mode", async () => {
    storeState.set("timeFormatMode", "invalid")
    await expect(loadTimeFormatMode()).resolves.toBe(DEFAULT_TIME_FORMAT_MODE)
  })
})
