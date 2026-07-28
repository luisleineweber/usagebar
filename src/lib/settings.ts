import { LazyStore } from "@tauri-apps/plugin-store"
import type { PluginMeta } from "@/lib/plugin-types"

// Refresh cooldown duration in milliseconds (5 minutes)
export const REFRESH_COOLDOWN_MS = 300_000

// Spec: persist plugin order + disabled list; new plugins join their default sorted position,
// default disabled unless in DEFAULT_ENABLED_PLUGINS.
export type PluginSettings = {
  order: string[]
  disabled: string[]
  /** Providers hidden from sidebar/provider navigation, but still shown on the shared dashboard. */
  hidden?: string[]
}

export type AutoUpdateIntervalMinutes = 5 | 15 | 30 | 60

export type ThemeMode = "system" | "light" | "dark"

export type AccentColor = "#bfff00" | "#86c5ff" | "#c1121f" | "#eb4600" | "#e07c8e"

export type DisplayMode = "used" | "left"

export type ResetTimerDisplayMode = "relative" | "absolute"

export type TimeFormatMode = "auto" | "12h" | "24h"

export type MenubarIconStyle = "provider" | "merged" | "bars" | "donut"

export type SurfacePin = {
  providerId: string
  metricLabel: string
  presentation: "text" | "bar"
}

export type GlobalShortcut = string | null

const SETTINGS_STORE_PATH = "settings.json"
const PLUGIN_SETTINGS_KEY = "plugins"
const ONBOARDING_IN_PROGRESS_KEY = "onboardingInProgress"
const AUTO_UPDATE_SETTINGS_KEY = "autoUpdateInterval"
const THEME_MODE_KEY = "themeMode"
const ACCENT_COLOR_KEY = "accentColor"
const DISPLAY_MODE_KEY = "displayMode"
const RESET_TIMER_DISPLAY_MODE_KEY = "resetTimerDisplayMode"
const TIME_FORMAT_MODE_KEY = "timeFormatMode"
const MENUBAR_ICON_STYLE_KEY = "menubarIconStyle"
const SHOW_HISTORY_IN_BAR_KEY = "showHistoryInBar"
const SURFACE_PINS_KEY = "surfacePins"
const LEGACY_TRAY_ICON_STYLE_KEY = "trayIconStyle"
const LEGACY_TRAY_SHOW_PERCENTAGE_KEY = "trayShowPercentage"
const GLOBAL_SHORTCUT_KEY = "globalShortcut"
const START_ON_LOGIN_KEY = "startOnLogin"

export const DEFAULT_AUTO_UPDATE_INTERVAL: AutoUpdateIntervalMinutes = 15
export const DEFAULT_THEME_MODE: ThemeMode = "system"
export const DEFAULT_ACCENT_COLOR: AccentColor = "#86c5ff"
export const DEFAULT_DISPLAY_MODE: DisplayMode = "left"
export const DEFAULT_RESET_TIMER_DISPLAY_MODE: ResetTimerDisplayMode = "relative"
export const DEFAULT_TIME_FORMAT_MODE: TimeFormatMode = "auto"
export const DEFAULT_MENUBAR_ICON_STYLE: MenubarIconStyle = "provider"
export const DEFAULT_SHOW_HISTORY_IN_BAR = true
export const DEFAULT_SURFACE_PINS: SurfacePin[] = []
export const MAX_SURFACE_PINS = 2
export const DEFAULT_GLOBAL_SHORTCUT: GlobalShortcut = null
export const DEFAULT_START_ON_LOGIN = false

const AUTO_UPDATE_INTERVALS: AutoUpdateIntervalMinutes[] = [5, 15, 30, 60]
const THEME_MODES: ThemeMode[] = ["system", "light", "dark"]
const ACCENT_COLORS: AccentColor[] = ["#bfff00", "#86c5ff", "#c1121f", "#eb4600", "#e07c8e"]
const DISPLAY_MODES: DisplayMode[] = ["used", "left"]
const RESET_TIMER_DISPLAY_MODES: ResetTimerDisplayMode[] = ["relative", "absolute"]
const TIME_FORMAT_MODES: TimeFormatMode[] = ["auto", "12h", "24h"]
const MENUBAR_ICON_STYLES: MenubarIconStyle[] = ["provider", "merged", "donut", "bars"]

export const MENUBAR_ICON_STYLE_OPTIONS: { value: MenubarIconStyle; label: string }[] = [
  { value: "provider", label: "Plugin" },
  { value: "merged", label: "Merged" },
  { value: "donut", label: "Donut" },
  { value: "bars", label: "Bars" },
]

export const AUTO_UPDATE_OPTIONS: { value: AutoUpdateIntervalMinutes; label: string }[] =
  AUTO_UPDATE_INTERVALS.map((value) => ({
    value,
    label: value === 60 ? "1 hour" : `${value} min`,
  }))

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = THEME_MODES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}))

export const ACCENT_COLOR_OPTIONS: { value: AccentColor; label: string }[] = [
  { value: "#bfff00", label: "Green" },
  { value: "#86c5ff", label: "Blue" },
  { value: "#c1121f", label: "Red" },
  { value: "#eb4600", label: "Orange" },
  { value: "#e07c8e", label: "Pink" },
]

export const DISPLAY_MODE_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "used", label: "Used" },
]

export const RESET_TIMER_DISPLAY_OPTIONS: { value: ResetTimerDisplayMode; label: string }[] = [
  { value: "relative", label: "Relative" },
  { value: "absolute", label: "Absolute" },
]

export const TIME_FORMAT_OPTIONS: { value: TimeFormatMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
]

const store = new LazyStore(SETTINGS_STORE_PATH)

const DEFAULT_ENABLED_PLUGINS = new Set(["claude", "codex", "cursor"])
const SETTINGS_PROVIDER_ORDER_PREFIX = ["codex", "claude", "cursor", "opencode"]
const LEGACY_APPENDED_PROVIDER = "qwen"

export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = {
  order: [],
  disabled: [],
}

export type LoadedPluginSettings = {
  settings: PluginSettings
  hasStoredSettings: boolean
  onboardingInProgress: boolean
}

export async function loadPluginSettingsRecord(): Promise<LoadedPluginSettings> {
  const [stored, onboardingInProgress] = await Promise.all([
    store.get<PluginSettings>(PLUGIN_SETTINGS_KEY),
    store.get<unknown>(ONBOARDING_IN_PROGRESS_KEY),
  ])
  if (!stored) {
    return {
      settings: { ...DEFAULT_PLUGIN_SETTINGS },
      hasStoredSettings: false,
      onboardingInProgress: onboardingInProgress === true,
    }
  }
  return {
    settings: {
      order: Array.isArray(stored.order) ? stored.order : [],
      disabled: Array.isArray(stored.disabled) ? stored.disabled : [],
      ...(Array.isArray(stored.hidden) ? { hidden: stored.hidden } : {}),
    },
    hasStoredSettings: true,
    onboardingInProgress: onboardingInProgress === true,
  }
}

export async function loadPluginSettings(): Promise<PluginSettings> {
  return (await loadPluginSettingsRecord()).settings
}

export async function savePluginSettings(settings: PluginSettings): Promise<void> {
  await store.set(PLUGIN_SETTINGS_KEY, settings)
  await store.save()
}

export async function saveOnboardingInProgress(value: boolean): Promise<void> {
  await store.set(ONBOARDING_IN_PROGRESS_KEY, value)
  await store.save()
}

function getDefaultPluginOrder(plugins: PluginMeta[]): string[] {
  const knownIds = plugins.map((plugin) => plugin.id)
  const knownSet = new Set(knownIds)
  const preferredOrder = new Set(SETTINGS_PROVIDER_ORDER_PREFIX)
  const pluginNames = new Map(plugins.map((plugin) => [plugin.id, plugin.name]))

  return [
    ...SETTINGS_PROVIDER_ORDER_PREFIX.filter((id) => knownSet.has(id)),
    ...knownIds
      .filter((id) => !preferredOrder.has(id))
      .sort((a, b) => {
        const nameCompare = (pluginNames.get(a) ?? a).localeCompare(
          pluginNames.get(b) ?? b,
          undefined,
          {
            sensitivity: "base",
          }
        )
        return nameCompare || a.localeCompare(b)
      }),
  ]
}

function isAutoUpdateInterval(value: unknown): value is AutoUpdateIntervalMinutes {
  return (
    typeof value === "number" && AUTO_UPDATE_INTERVALS.includes(value as AutoUpdateIntervalMinutes)
  )
}

export async function loadAutoUpdateInterval(): Promise<AutoUpdateIntervalMinutes> {
  const stored = await store.get<unknown>(AUTO_UPDATE_SETTINGS_KEY)
  if (isAutoUpdateInterval(stored)) return stored
  return DEFAULT_AUTO_UPDATE_INTERVAL
}

export async function saveAutoUpdateInterval(interval: AutoUpdateIntervalMinutes): Promise<void> {
  await store.set(AUTO_UPDATE_SETTINGS_KEY, interval)
  await store.save()
}

export function normalizePluginSettings(
  settings: PluginSettings,
  plugins: PluginMeta[]
): PluginSettings {
  const defaultOrder = getDefaultPluginOrder(plugins)
  const knownSet = new Set(defaultOrder)

  // Alpha 6 briefly appended Qwen after the full provider list. Repair only
  // that recognizable generated order; preserve arbitrary user drag order.
  const legacyOrderWithoutQwen = defaultOrder.filter((id) => id !== LEGACY_APPENDED_PROVIDER)
  const knownSavedOrder = settings.order.filter((id) => knownSet.has(id))
  const hasLegacyAppendedQwen =
    knownSavedOrder[knownSavedOrder.length - 1] === LEGACY_APPENDED_PROVIDER &&
    knownSavedOrder.slice(0, -1).join("\0") === legacyOrderWithoutQwen.join("\0")
  const savedOrder = hasLegacyAppendedQwen ? settings.order.slice(0, -1) : settings.order

  const order: string[] = []
  const seen = new Set<string>()
  for (const id of savedOrder) {
    if (!knownSet.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }
  const hasStoredOrder = order.length > 0
  for (const id of defaultOrder) {
    if (!seen.has(id)) {
      seen.add(id)
      const defaultIndex = defaultOrder.indexOf(id)
      const insertAt = order.findIndex(
        (existingId, index) => index > 0 && defaultOrder.indexOf(existingId) > defaultIndex
      )
      if (insertAt === -1) order.push(id)
      else order.splice(insertAt, 0, id)
    }
  }

  const disabled = settings.disabled.filter((id) => knownSet.has(id))
  const hidden = (settings.hidden ?? []).filter((id) => knownSet.has(id))
  for (const id of defaultOrder) {
    if (savedOrder.includes(id)) continue
    if (!DEFAULT_ENABLED_PLUGINS.has(id) && !disabled.includes(id)) {
      disabled.push(id)
    }
  }

  return {
    order: hasStoredOrder ? order : defaultOrder,
    disabled,
    ...(hidden.length > 0 ? { hidden } : {}),
  }
}

export function arePluginSettingsEqual(a: PluginSettings, b: PluginSettings): boolean {
  if (a.order.length !== b.order.length) return false
  if (a.disabled.length !== b.disabled.length) return false
  const aHidden = a.hidden ?? []
  const bHidden = b.hidden ?? []
  if (aHidden.length !== bHidden.length) return false
  for (let i = 0; i < a.order.length; i += 1) {
    if (a.order[i] !== b.order[i]) return false
  }
  for (let i = 0; i < a.disabled.length; i += 1) {
    if (a.disabled[i] !== b.disabled[i]) return false
  }
  for (let i = 0; i < aHidden.length; i += 1) {
    if (aHidden[i] !== bHidden[i]) return false
  }
  return true
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode)
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const stored = await store.get<unknown>(THEME_MODE_KEY)
  if (isThemeMode(stored)) return stored
  return DEFAULT_THEME_MODE
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await store.set(THEME_MODE_KEY, mode)
  await store.save()
}

function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && ACCENT_COLORS.includes(value as AccentColor)
}

export async function loadAccentColor(): Promise<AccentColor> {
  const stored = await store.get<unknown>(ACCENT_COLOR_KEY)
  if (isAccentColor(stored)) return stored
  return DEFAULT_ACCENT_COLOR
}

export async function saveAccentColor(color: AccentColor): Promise<void> {
  await store.set(ACCENT_COLOR_KEY, color)
  await store.save()
}

function isDisplayMode(value: unknown): value is DisplayMode {
  return typeof value === "string" && DISPLAY_MODES.includes(value as DisplayMode)
}

export async function loadDisplayMode(): Promise<DisplayMode> {
  const stored = await store.get<unknown>(DISPLAY_MODE_KEY)
  if (isDisplayMode(stored)) return stored
  return DEFAULT_DISPLAY_MODE
}

export async function saveDisplayMode(mode: DisplayMode): Promise<void> {
  await store.set(DISPLAY_MODE_KEY, mode)
  await store.save()
}

function isResetTimerDisplayMode(value: unknown): value is ResetTimerDisplayMode {
  return (
    typeof value === "string" && RESET_TIMER_DISPLAY_MODES.includes(value as ResetTimerDisplayMode)
  )
}

export async function loadResetTimerDisplayMode(): Promise<ResetTimerDisplayMode> {
  const stored = await store.get<unknown>(RESET_TIMER_DISPLAY_MODE_KEY)
  if (isResetTimerDisplayMode(stored)) return stored
  return DEFAULT_RESET_TIMER_DISPLAY_MODE
}

export async function saveResetTimerDisplayMode(mode: ResetTimerDisplayMode): Promise<void> {
  await store.set(RESET_TIMER_DISPLAY_MODE_KEY, mode)
  await store.save()
}

function isTimeFormatMode(value: unknown): value is TimeFormatMode {
  return typeof value === "string" && TIME_FORMAT_MODES.includes(value as TimeFormatMode)
}

export async function loadTimeFormatMode(): Promise<TimeFormatMode> {
  const stored = await store.get<unknown>(TIME_FORMAT_MODE_KEY)
  if (isTimeFormatMode(stored)) return stored
  return DEFAULT_TIME_FORMAT_MODE
}

export async function saveTimeFormatMode(mode: TimeFormatMode): Promise<void> {
  await store.set(TIME_FORMAT_MODE_KEY, mode)
  await store.save()
}

function isMenubarIconStyle(value: unknown): value is MenubarIconStyle {
  return typeof value === "string" && MENUBAR_ICON_STYLES.includes(value as MenubarIconStyle)
}

export async function loadMenubarIconStyle(): Promise<MenubarIconStyle> {
  const stored = await store.get<unknown>(MENUBAR_ICON_STYLE_KEY)
  if (isMenubarIconStyle(stored)) return stored
  return DEFAULT_MENUBAR_ICON_STYLE
}

export async function saveMenubarIconStyle(style: MenubarIconStyle): Promise<void> {
  await store.set(MENUBAR_ICON_STYLE_KEY, style)
  await store.save()
}

export async function loadShowHistoryInBar(): Promise<boolean> {
  const stored = await store.get<unknown>(SHOW_HISTORY_IN_BAR_KEY)
  if (typeof stored === "boolean") return stored
  return DEFAULT_SHOW_HISTORY_IN_BAR
}

export async function saveShowHistoryInBar(value: boolean): Promise<void> {
  await store.set(SHOW_HISTORY_IN_BAR_KEY, value)
  await store.save()
}

export function normalizeSurfacePins(value: unknown, plugins: PluginMeta[]): SurfacePin[] {
  if (!Array.isArray(value)) return []
  const progressLabelsByProvider = new Map(
    plugins.map((plugin) => [
      plugin.id,
      new Set(plugin.lines.filter((line) => line.type === "progress").map((line) => line.label)),
    ])
  )
  const pins: SurfacePin[] = []
  const seen = new Set<string>()

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue
    const raw = candidate as Record<string, unknown>
    const providerId = typeof raw.providerId === "string" ? raw.providerId.trim() : ""
    const metricLabel = typeof raw.metricLabel === "string" ? raw.metricLabel.trim() : ""
    const presentation =
      raw.presentation === "text" ? "text" : raw.presentation === "bar" ? "bar" : null
    const metricLabels = progressLabelsByProvider.get(providerId)
    const key = `${providerId}\u0000${metricLabel}`
    if (
      !providerId ||
      !metricLabel ||
      !presentation ||
      !metricLabels?.has(metricLabel) ||
      seen.has(key)
    ) {
      continue
    }
    seen.add(key)
    pins.push({ providerId, metricLabel, presentation })
    if (pins.length >= MAX_SURFACE_PINS) break
  }

  return pins
}

export async function loadSurfacePins(plugins: PluginMeta[]): Promise<SurfacePin[]> {
  return normalizeSurfacePins(await store.get<unknown>(SURFACE_PINS_KEY), plugins)
}

export async function saveSurfacePins(pins: readonly SurfacePin[]): Promise<void> {
  await store.set(SURFACE_PINS_KEY, pins.slice(0, MAX_SURFACE_PINS))
  await store.save()
}

type LegacyStoreWithDelete = {
  delete?: (key: string) => Promise<void>
}

async function deleteStoreKey(key: string): Promise<void> {
  const maybeDelete = (store as unknown as LegacyStoreWithDelete).delete
  if (typeof maybeDelete === "function") {
    await maybeDelete.call(store, key)
    return
  }
  // Fallback for store implementations without delete support.
  await store.set(key, null)
}

export async function migrateLegacyTraySettings(): Promise<void> {
  const [legacyTrayStyle, legacyShowPercentage, currentMenubarStyle] = await Promise.all([
    store.get<unknown>(LEGACY_TRAY_ICON_STYLE_KEY),
    store.get<unknown>(LEGACY_TRAY_SHOW_PERCENTAGE_KEY),
    store.get<unknown>(MENUBAR_ICON_STYLE_KEY),
  ])

  const hasLegacyTrayStyle = legacyTrayStyle != null
  const hasLegacyShowPercentage = legacyShowPercentage != null
  if (!hasLegacyTrayStyle && !hasLegacyShowPercentage) return

  if (hasLegacyTrayStyle && currentMenubarStyle == null) {
    if (legacyTrayStyle === "bars") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "bars")
    } else if (legacyTrayStyle === "circle") {
      await store.set(MENUBAR_ICON_STYLE_KEY, "donut")
    }
  }

  const removals: Promise<void>[] = []
  if (hasLegacyTrayStyle) removals.push(deleteStoreKey(LEGACY_TRAY_ICON_STYLE_KEY))
  if (hasLegacyShowPercentage) removals.push(deleteStoreKey(LEGACY_TRAY_SHOW_PERCENTAGE_KEY))
  await Promise.all(removals)
  await store.save()
}

export function getEnabledPluginIds(settings: PluginSettings): string[] {
  const disabledSet = new Set(settings.disabled)
  return settings.order.filter((id) => !disabledSet.has(id))
}

export function isPluginProbeSupported(plugin: Pick<PluginMeta, "supportState">): boolean {
  return plugin.supportState !== "comingSoonOnWindows"
}

export function getProbeEligiblePluginIds(
  settings: PluginSettings,
  plugins: PluginMeta[]
): string[] {
  const supportedIds = new Set(
    plugins.filter((plugin) => isPluginProbeSupported(plugin)).map((plugin) => plugin.id)
  )
  return getEnabledPluginIds(settings).filter((id) => supportedIds.has(id))
}

function isGlobalShortcut(value: unknown): value is GlobalShortcut {
  if (value === null) return true
  return typeof value === "string"
}

export async function loadGlobalShortcut(): Promise<GlobalShortcut> {
  const stored = await store.get<unknown>(GLOBAL_SHORTCUT_KEY)
  if (isGlobalShortcut(stored)) return stored
  return DEFAULT_GLOBAL_SHORTCUT
}

export async function saveGlobalShortcut(shortcut: GlobalShortcut): Promise<void> {
  await store.set(GLOBAL_SHORTCUT_KEY, shortcut)
  await store.save()
}

export async function loadStartOnLogin(): Promise<boolean> {
  const stored = await store.get<unknown>(START_ON_LOGIN_KEY)
  if (typeof stored === "boolean") return stored
  return DEFAULT_START_ON_LOGIN
}

export async function saveStartOnLogin(value: boolean): Promise<void> {
  await store.set(START_ON_LOGIN_KEY, value)
  await store.save()
}
