import { create } from "zustand"
import {
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_TRAY_PROVIDER_SELECTION,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_SHOW_HISTORY_IN_BAR,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_SURFACE_PINS,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  type AutoUpdateIntervalMinutes,
  type AccentColor,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type TrayProviderSelection,
  type ResetTimerDisplayMode,
  type SurfacePin,
  type ThemeMode,
  type TimeFormatMode,
} from "@/lib/settings"

type AppPreferencesStore = {
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
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setAccentColor: (value: AccentColor) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setTrayProviderSelection: (value: TrayProviderSelection) => void
  setSurfacePins: (value: SurfacePin[]) => void
  setShowHistoryInBar: (value: boolean) => void
  resetState: () => void
}

const initialState = {
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
  surfacePins: DEFAULT_SURFACE_PINS,
  showHistoryInBar: DEFAULT_SHOW_HISTORY_IN_BAR,
}

export const useAppPreferencesStore = create<AppPreferencesStore>((set) => ({
  ...initialState,
  setAutoUpdateInterval: (value) => set({ autoUpdateInterval: value }),
  setThemeMode: (value) => set({ themeMode: value }),
  setAccentColor: (value) => set({ accentColor: value }),
  setDisplayMode: (value) => set({ displayMode: value }),
  setResetTimerDisplayMode: (value) => set({ resetTimerDisplayMode: value }),
  setTimeFormatMode: (value) => set({ timeFormatMode: value }),
  setGlobalShortcut: (value) => set({ globalShortcut: value }),
  setStartOnLogin: (value) => set({ startOnLogin: value }),
  setMenubarIconStyle: (value) => set({ menubarIconStyle: value }),
  setTrayProviderSelection: (value) => set({ trayProviderSelection: value }),
  setSurfacePins: (value) => set({ surfacePins: value }),
  setShowHistoryInBar: (value) => set({ showHistoryInBar: value }),
  resetState: () => set(initialState),
}))
