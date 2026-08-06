import { useCallback } from "react"
import {
  saveAccentColor,
  saveDisplayMode,
  saveMenubarIconStyle,
  saveTrayProviderSelection,
  saveResetTimerDisplayMode,
  saveThemeMode,
  saveTimeFormatMode,
  saveSurfacePins,
  saveShowHistoryInBar,
  type DisplayMode,
  type AccentColor,
  type MenubarIconStyle,
  type TrayProviderSelection,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type TimeFormatMode,
  type SurfacePin,
} from "@/lib/settings"
import { notifyDisplayPreferenceUpdated } from "@/lib/display-preference-events"

type ScheduleTrayIconUpdate = (reason: "probe" | "settings" | "init", delayMs?: number) => void

type UseSettingsDisplayActionsArgs = {
  setThemeMode: (value: ThemeMode) => void
  setAccentColor: (value: AccentColor) => void
  setDisplayMode: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setTrayProviderSelection: (value: TrayProviderSelection) => void
  setSurfacePins: (value: SurfacePin[]) => void
  setShowHistoryInBar: (value: boolean) => void
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useSettingsDisplayActions({
  setThemeMode,
  setAccentColor,
  setDisplayMode,
  resetTimerDisplayMode,
  setResetTimerDisplayMode,
  setTimeFormatMode,
  setMenubarIconStyle,
  setTrayProviderSelection,
  setSurfacePins,
  setShowHistoryInBar,
  scheduleTrayIconUpdate,
}: UseSettingsDisplayActionsArgs) {
  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode)
    void notifyDisplayPreferenceUpdated({ key: "themeMode", value: mode }).catch((error) => {
      console.error("Failed to publish theme mode update:", error)
    })
    void saveThemeMode(mode).catch((error) => {
      console.error("Failed to save theme mode:", error)
    })
  }, [setThemeMode])

  const handleAccentColorChange = useCallback((color: AccentColor) => {
    setAccentColor(color)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "accentColor", value: color }).catch((error) => {
      console.error("Failed to publish accent color update:", error)
    })
    void saveAccentColor(color).catch((error) => {
      console.error("Failed to save accent color:", error)
    })
  }, [scheduleTrayIconUpdate, setAccentColor])

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "displayMode", value: mode }).catch((error) => {
      console.error("Failed to publish display mode update:", error)
    })
    void saveDisplayMode(mode).catch((error) => {
      console.error("Failed to save display mode:", error)
    })
  }, [scheduleTrayIconUpdate, setDisplayMode])

  const handleResetTimerDisplayModeChange = useCallback((mode: ResetTimerDisplayMode) => {
    setResetTimerDisplayMode(mode)
    void notifyDisplayPreferenceUpdated({ key: "resetTimerDisplayMode", value: mode }).catch((error) => {
      console.error("Failed to publish reset timer display mode update:", error)
    })
    void saveResetTimerDisplayMode(mode).catch((error) => {
      console.error("Failed to save reset timer display mode:", error)
    })
  }, [setResetTimerDisplayMode])

  const handleResetTimerDisplayModeToggle = useCallback(() => {
    const next = resetTimerDisplayMode === "relative" ? "absolute" : "relative"
    handleResetTimerDisplayModeChange(next)
  }, [handleResetTimerDisplayModeChange, resetTimerDisplayMode])

  const handleTimeFormatModeChange = useCallback((mode: TimeFormatMode) => {
    setTimeFormatMode(mode)
    void notifyDisplayPreferenceUpdated({ key: "timeFormatMode", value: mode }).catch((error) => {
      console.error("Failed to publish time format mode update:", error)
    })
    void saveTimeFormatMode(mode).catch((error) => {
      console.error("Failed to save time format mode:", error)
    })
  }, [setTimeFormatMode])

  const handleMenubarIconStyleChange = useCallback((style: MenubarIconStyle) => {
    setMenubarIconStyle(style)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "menubarIconStyle", value: style }).catch((error) => {
      console.error("Failed to publish menubar icon style update:", error)
    })
    void saveMenubarIconStyle(style).catch((error) => {
      console.error("Failed to save menubar icon style:", error)
    })
  }, [scheduleTrayIconUpdate, setMenubarIconStyle])

  const handleTrayProviderSelectionChange = useCallback((selection: TrayProviderSelection) => {
    setTrayProviderSelection(selection)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "trayProviderSelection", value: selection }).catch((error) => {
      console.error("Failed to publish tray provider selection update:", error)
    })
    void saveTrayProviderSelection(selection).catch((error) => {
      console.error("Failed to save tray provider selection:", error)
    })
  }, [scheduleTrayIconUpdate, setTrayProviderSelection])

  const handleSurfacePinsChange = useCallback((pins: SurfacePin[]) => {
    setSurfacePins(pins)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "surfacePins", value: pins }).catch((error) => {
      console.error("Failed to publish surface pin update:", error)
    })
    void saveSurfacePins(pins).catch((error) => {
      console.error("Failed to save surface pins:", error)
    })
  }, [scheduleTrayIconUpdate, setSurfacePins])

  const handleShowHistoryInBarChange = useCallback((value: boolean) => {
    setShowHistoryInBar(value)
    void notifyDisplayPreferenceUpdated({ key: "showHistoryInBar", value }).catch((error) => {
      console.error("Failed to publish history visibility update:", error)
    })
    void saveShowHistoryInBar(value).catch((error) => {
      console.error("Failed to save history visibility:", error)
    })
  }, [setShowHistoryInBar])

  return {
    handleThemeModeChange,
    handleAccentColorChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleTimeFormatModeChange,
    handleMenubarIconStyleChange,
    handleTrayProviderSelectionChange,
    handleSurfacePinsChange,
    handleShowHistoryInBarChange,
  }
}
