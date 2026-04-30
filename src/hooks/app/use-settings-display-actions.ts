import { useCallback } from "react"
import { track } from "@/lib/analytics"
import {
  saveDisplayMode,
  saveMenubarIconStyle,
  saveResetTimerDisplayMode,
  saveThemeMode,
  type DisplayMode,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type ThemeMode,
} from "@/lib/settings"
import { notifyDisplayPreferenceUpdated } from "@/lib/display-preference-events"

type ScheduleTrayIconUpdate = (reason: "probe" | "settings" | "init", delayMs?: number) => void

type UseSettingsDisplayActionsArgs = {
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useSettingsDisplayActions({
  setThemeMode,
  setDisplayMode,
  resetTimerDisplayMode,
  setResetTimerDisplayMode,
  setMenubarIconStyle,
  scheduleTrayIconUpdate,
}: UseSettingsDisplayActionsArgs) {
  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    track("setting_changed", { setting: "theme", value: mode })
    setThemeMode(mode)
    void notifyDisplayPreferenceUpdated({ key: "themeMode", value: mode }).catch((error) => {
      console.error("Failed to publish theme mode update:", error)
    })
    void saveThemeMode(mode).catch((error) => {
      console.error("Failed to save theme mode:", error)
    })
  }, [setThemeMode])

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    track("setting_changed", { setting: "display_mode", value: mode })
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
    track("setting_changed", { setting: "reset_timer_display_mode", value: mode })
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

  const handleMenubarIconStyleChange = useCallback((style: MenubarIconStyle) => {
    track("setting_changed", { setting: "menubar_icon_style", value: style })
    setMenubarIconStyle(style)
    scheduleTrayIconUpdate("settings", 0)
    void notifyDisplayPreferenceUpdated({ key: "menubarIconStyle", value: style }).catch((error) => {
      console.error("Failed to publish menubar icon style update:", error)
    })
    void saveMenubarIconStyle(style).catch((error) => {
      console.error("Failed to save menubar icon style:", error)
    })
  }, [scheduleTrayIconUpdate, setMenubarIconStyle])

  return {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleMenubarIconStyleChange,
  }
}
