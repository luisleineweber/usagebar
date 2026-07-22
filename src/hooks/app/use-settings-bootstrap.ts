import { useCallback, useEffect } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart"
import type { PluginMeta } from "@/lib/plugin-types"
import {
  arePluginSettingsEqual,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_AUTO_UPDATE_INTERVAL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MENUBAR_ICON_STYLE,
  DEFAULT_RESET_TIMER_DISPLAY_MODE,
  DEFAULT_START_ON_LOGIN,
  DEFAULT_SURFACE_PINS,
  DEFAULT_THEME_MODE,
  DEFAULT_TIME_FORMAT_MODE,
  getProbeEligiblePluginIds,
  loadAutoUpdateInterval,
  loadAccentColor,
  loadDisplayMode,
  loadGlobalShortcut,
  loadMenubarIconStyle,
  migrateLegacyTraySettings,
  loadPluginSettings,
  loadResetTimerDisplayMode,
  loadStartOnLogin,
  loadSurfacePins,
  loadThemeMode,
  loadTimeFormatMode,
  normalizePluginSettings,
  savePluginSettings,
  type AutoUpdateIntervalMinutes,
  type AccentColor,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type PluginSettings,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type TimeFormatMode,
  type SurfacePin,
} from "@/lib/settings"

type UseSettingsBootstrapArgs = {
  setPluginSettings: (value: PluginSettings | null) => void
  setPluginsMeta: (value: PluginMeta[]) => void
  setAutoUpdateInterval: (value: AutoUpdateIntervalMinutes) => void
  setThemeMode: (value: ThemeMode) => void
  setAccentColor: (value: AccentColor) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setGlobalShortcut: (value: GlobalShortcut) => void
  setStartOnLogin: (value: boolean) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setSurfacePins: (value: SurfacePin[]) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
}

export function useSettingsBootstrap({
  setPluginSettings,
  setPluginsMeta,
  setAutoUpdateInterval,
  setThemeMode,
  setAccentColor,
  setDisplayMode,
  setResetTimerDisplayMode,
  setTimeFormatMode,
  setGlobalShortcut,
  setStartOnLogin,
  setMenubarIconStyle,
  setSurfacePins,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
}: UseSettingsBootstrapArgs) {
  const applyStartOnLogin = useCallback(async (value: boolean) => {
    if (!isTauri() || import.meta.env.DEV) return
    const currentlyEnabled = await isAutostartEnabled()

    if (value) {
      await enableAutostart()
      return
    }

    if (!currentlyEnabled) return

    await disableAutostart()
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadSettings = async () => {
      try {
        const availablePlugins = await invoke<PluginMeta[]>("list_plugins")
        const surfacedPlugins = availablePlugins.filter((plugin) => plugin.isSurfaced !== false)
        if (!isMounted) return
        setPluginsMeta(surfacedPlugins)

        const storedSettings = await loadPluginSettings()
        const normalized = normalizePluginSettings(storedSettings, surfacedPlugins)
        const enabledIds = getProbeEligiblePluginIds(normalized, surfacedPlugins)
        if (isMounted) {
          setPluginSettings(normalized)
          setLoadingForPlugins(enabledIds)
        }
        if (!arePluginSettingsEqual(storedSettings, normalized)) {
          await savePluginSettings(normalized)
        }

        let storedInterval = DEFAULT_AUTO_UPDATE_INTERVAL
        try {
          storedInterval = await loadAutoUpdateInterval()
        } catch (error) {
          console.error("Failed to load auto-update interval:", error)
        }

        let storedThemeMode = DEFAULT_THEME_MODE
        try {
          storedThemeMode = await loadThemeMode()
        } catch (error) {
          console.error("Failed to load theme mode:", error)
        }

        let storedAccentColor = DEFAULT_ACCENT_COLOR
        try {
          storedAccentColor = await loadAccentColor()
        } catch (error) {
          console.error("Failed to load accent color:", error)
        }

        let storedDisplayMode = DEFAULT_DISPLAY_MODE
        try {
          storedDisplayMode = await loadDisplayMode()
        } catch (error) {
          console.error("Failed to load display mode:", error)
        }

        let storedResetTimerDisplayMode = DEFAULT_RESET_TIMER_DISPLAY_MODE
        try {
          storedResetTimerDisplayMode = await loadResetTimerDisplayMode()
        } catch (error) {
          console.error("Failed to load reset timer display mode:", error)
        }

        let storedTimeFormatMode = DEFAULT_TIME_FORMAT_MODE
        try {
          storedTimeFormatMode = await loadTimeFormatMode()
        } catch (error) {
          console.error("Failed to load time format mode:", error)
        }

        let storedGlobalShortcut = DEFAULT_GLOBAL_SHORTCUT
        try {
          storedGlobalShortcut = await loadGlobalShortcut()
        } catch (error) {
          console.error("Failed to load global shortcut:", error)
        }

        let storedStartOnLogin = DEFAULT_START_ON_LOGIN
        try {
          storedStartOnLogin = await loadStartOnLogin()
        } catch (error) {
          console.error("Failed to load start on login:", error)
        }

        try {
          await applyStartOnLogin(storedStartOnLogin)
        } catch (error) {
          console.error("Failed to apply start on login setting:", error)
        }
        try {
          await migrateLegacyTraySettings()
        } catch (error) {
          console.error("Failed to migrate legacy tray settings:", error)
        }

        let storedMenubarIconStyle = DEFAULT_MENUBAR_ICON_STYLE
        try {
          storedMenubarIconStyle = await loadMenubarIconStyle()
        } catch (error) {
          console.error("Failed to load menubar icon style:", error)
        }

        let storedSurfacePins = DEFAULT_SURFACE_PINS
        try {
          storedSurfacePins = await loadSurfacePins(surfacedPlugins)
        } catch (error) {
          console.error("Failed to load surface pins:", error)
        }

        if (isMounted) {
          setAutoUpdateInterval(storedInterval)
          setThemeMode(storedThemeMode)
          setAccentColor(storedAccentColor)
          setDisplayMode(storedDisplayMode)
          setResetTimerDisplayMode(storedResetTimerDisplayMode)
          setTimeFormatMode(storedTimeFormatMode)
          setGlobalShortcut(storedGlobalShortcut)
          setStartOnLogin(storedStartOnLogin)
          setMenubarIconStyle(storedMenubarIconStyle)
          setSurfacePins(storedSurfacePins)

          try {
            await startBatch(enabledIds)
          } catch (error) {
            console.error("Failed to start probe batch:", error)
            if (isMounted) {
              setErrorForPlugins(enabledIds, "Failed to start probe")
            }
          }
        }
      } catch (e) {
        console.error("Failed to load plugin settings:", e)
      }
    }

    loadSettings()

    return () => {
      isMounted = false
    }
  }, [
    applyStartOnLogin,
    setAutoUpdateInterval,
    setDisplayMode,
    setErrorForPlugins,
    setGlobalShortcut,
    setLoadingForPlugins,
    setMenubarIconStyle,
    setSurfacePins,
    migrateLegacyTraySettings,
    setPluginSettings,
    setPluginsMeta,
    setResetTimerDisplayMode,
    setStartOnLogin,
    setThemeMode,
    setAccentColor,
    setTimeFormatMode,
    startBatch,
  ])

  return {
    applyStartOnLogin,
  }
}
