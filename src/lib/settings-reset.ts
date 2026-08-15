import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_PLUGIN_SETTINGS,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_SHOW_HISTORY_IN_BAR,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_SURFACE_PINS,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  DEFAULT_TRAY_PROVIDER_SELECTION,
  getProbeEligiblePluginIds,
  normalizePluginSettings,
  saveAccentColor,
  saveAutoUpdateInterval,
  saveDisplayMode,
  saveGlobalShortcut,
  saveMenubarIconStyle,
  savePluginSettings,
  saveResetTimerDisplayMode,
  saveShowHistoryInBar,
  saveStartOnLogin,
  saveSurfacePins,
  saveThemeMode,
  saveTimeFormatMode,
  saveTrayProviderSelection,
  type AccentColor,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type PluginSettings,
  type ResetTimerDisplayMode,
  type SurfacePin,
  type ThemeMode,
  type TimeFormatMode,
  type TrayProviderSelection,
} from "@/lib/settings"
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/notification-events"
import { saveNotificationPreferences } from "@/lib/notification-settings"
import { saveModelPriceOverrides } from "@/lib/report-pricing"
import type { PluginMeta } from "@/lib/plugin-types"

export type ResetSettings = {
  pluginSettings: PluginSettings
  probePluginIds: string[]
  autoUpdateInterval: AutoUpdateIntervalMinutes
  themeMode: ThemeMode
  accentColor: AccentColor
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode: TimeFormatMode
  globalShortcut: GlobalShortcut
  startOnLogin: boolean
  menubarIconStyle: MenubarIconStyle
  trayProviderSelection: TrayProviderSelection
  surfacePins: SurfacePin[]
  showHistoryInBar: boolean
}

export function getDefaultSettings(plugins: PluginMeta[]): ResetSettings {
  const pluginSettings = normalizePluginSettings(DEFAULT_PLUGIN_SETTINGS, plugins)

  return {
    pluginSettings,
    probePluginIds: getProbeEligiblePluginIds(pluginSettings, plugins),
    autoUpdateInterval: DEFAULT_AUTO_UPDATE_INTERVAL,
    themeMode: DEFAULT_THEME_MODE,
    accentColor: DEFAULT_ACCENT_COLOR,
    displayMode: DEFAULT_DISPLAY_MODE,
    resetTimerDisplayMode: DEFAULT_RESET_TIMER_DISPLAY_MODE,
    timeFormatMode: DEFAULT_TIME_FORMAT_MODE,
    globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
    startOnLogin: DEFAULT_START_ON_LOGIN,
    menubarIconStyle: DEFAULT_MENUBAR_ICON_STYLE,
    trayProviderSelection: DEFAULT_TRAY_PROVIDER_SELECTION,
    surfacePins: [...DEFAULT_SURFACE_PINS],
    showHistoryInBar: DEFAULT_SHOW_HISTORY_IN_BAR,
  }
}

/** Reset preferences only. Provider configurations, credentials, and usage data stay untouched. */
export async function resetAllSettings(plugins: PluginMeta[]): Promise<ResetSettings> {
  const defaults = getDefaultSettings(plugins)

  // Save one preference at a time. Several modules own LazyStore instances for the same file.
  // Concurrent saves can otherwise overwrite each other's changes.
  await savePluginSettings(defaults.pluginSettings)
  await saveAutoUpdateInterval(defaults.autoUpdateInterval)
  await saveThemeMode(defaults.themeMode)
  await saveAccentColor(defaults.accentColor)
  await saveDisplayMode(defaults.displayMode)
  await saveResetTimerDisplayMode(defaults.resetTimerDisplayMode)
  await saveTimeFormatMode(defaults.timeFormatMode)
  await saveGlobalShortcut(defaults.globalShortcut)
  await saveStartOnLogin(defaults.startOnLogin)
  await saveMenubarIconStyle(defaults.menubarIconStyle)
  await saveTrayProviderSelection(defaults.trayProviderSelection)
  await saveSurfacePins(defaults.surfacePins)
  await saveShowHistoryInBar(defaults.showHistoryInBar)
  await saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES)
  await saveModelPriceOverrides({})

  return defaults
}
