import { useEffect, type RefObject } from "react"
import { listenDisplayPreferenceUpdated } from "@/lib/display-preference-events"
import { listenPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import { listenSettingsReset } from "@/lib/settings-reset-events"
import type { ResetSettings } from "@/lib/settings-reset"
import type {
  AccentColor,
  DisplayMode,
  MenubarIconStyle,
  PluginSettings,
  ResetTimerDisplayMode,
  SurfacePin,
  ThemeMode,
  TimeFormatMode,
  TrayProviderSelection,
} from "@/lib/settings"
import type { TrayUpdateReason } from "@/hooks/app/use-tray-icon"

type UseAppWindowSyncArgs = {
  finishFirstRunRef: RefObject<() => void>
  setPluginSettings: (value: PluginSettings | null) => void
  scheduleTrayIconUpdate: (reason: TrayUpdateReason, delayMs?: number) => void
  setThemeMode: (value: ThemeMode) => void
  setAccentColor: (value: AccentColor) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setSurfacePins: (value: SurfacePin[]) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setTrayProviderSelection: (value: TrayProviderSelection) => void
  setShowHistoryInBar: (value: boolean) => void
  setAutoUpdateInterval: (value: ResetSettings["autoUpdateInterval"]) => void
  setGlobalShortcut: (value: ResetSettings["globalShortcut"]) => void
  setStartOnLogin: (value: ResetSettings["startOnLogin"]) => void
  setAutoUpdateNextAt: (value: number | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
  setErrorForPlugins: (ids: string[], error: string) => void
}

export function useAppWindowSync({
  finishFirstRunRef,
  setPluginSettings,
  scheduleTrayIconUpdate,
  setThemeMode,
  setAccentColor,
  setDisplayMode,
  setResetTimerDisplayMode,
  setTimeFormatMode,
  setSurfacePins,
  setMenubarIconStyle,
  setTrayProviderSelection,
  setShowHistoryInBar,
  setAutoUpdateInterval,
  setGlobalShortcut,
  setStartOnLogin,
  setAutoUpdateNextAt,
  setLoadingForPlugins,
  startBatch,
  setErrorForPlugins,
}: UseAppWindowSyncArgs) {
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    void listenPluginSettingsUpdated((nextSettings) => {
      finishFirstRunRef.current()
      setPluginSettings(nextSettings)
      scheduleTrayIconUpdate("settings", 0)
    })
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch((error) => {
        console.error("Failed to listen for plugin settings updates:", error)
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [finishFirstRunRef, scheduleTrayIconUpdate, setPluginSettings])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    void listenSettingsReset((reset: ResetSettings) => {
      finishFirstRunRef.current()
      setPluginSettings(reset.pluginSettings)
      setAutoUpdateInterval(reset.autoUpdateInterval)
      setThemeMode(reset.themeMode)
      setAccentColor(reset.accentColor)
      setDisplayMode(reset.displayMode)
      setResetTimerDisplayMode(reset.resetTimerDisplayMode)
      setTimeFormatMode(reset.timeFormatMode)
      setGlobalShortcut(reset.globalShortcut)
      setStartOnLogin(reset.startOnLogin)
      setMenubarIconStyle(reset.menubarIconStyle)
      setTrayProviderSelection(reset.trayProviderSelection)
      setSurfacePins(reset.surfacePins)
      setShowHistoryInBar(reset.showHistoryInBar)
      setAutoUpdateNextAt(null)
      setLoadingForPlugins(reset.probePluginIds)
      scheduleTrayIconUpdate("settings", 0)

      void startBatch(reset.probePluginIds)
        .then((startedIds) => {
          if (startedIds && startedIds.length > 0) setLoadingForPlugins(startedIds)
        })
        .catch((error) => {
          console.error("Failed to start probes after settings reset:", error)
          setErrorForPlugins(reset.probePluginIds, "Failed to start probe")
        })
    })
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch((error) => {
        console.error("Failed to listen for settings reset:", error)
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [
    finishFirstRunRef,
    scheduleTrayIconUpdate,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setErrorForPlugins,
    setGlobalShortcut,
    setLoadingForPlugins,
    setMenubarIconStyle,
    setPluginSettings,
    setResetTimerDisplayMode,
    setShowHistoryInBar,
    setStartOnLogin,
    setSurfacePins,
    startBatch,
    setThemeMode,
    setTimeFormatMode,
    setAccentColor,
    setDisplayMode,
    setTrayProviderSelection,
  ])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    void listenDisplayPreferenceUpdated((update) => {
      if (update.key === "themeMode") {
        setThemeMode(update.value)
        return
      }
      if (update.key === "accentColor") {
        setAccentColor(update.value)
        scheduleTrayIconUpdate("settings", 0)
        return
      }
      if (update.key === "displayMode") {
        setDisplayMode(update.value)
        scheduleTrayIconUpdate("settings", 0)
        return
      }
      if (update.key === "resetTimerDisplayMode") {
        setResetTimerDisplayMode(update.value)
        return
      }
      if (update.key === "timeFormatMode") {
        setTimeFormatMode(update.value)
        return
      }
      if (update.key === "surfacePins") {
        setSurfacePins(update.value)
        scheduleTrayIconUpdate("settings", 0)
        return
      }
      if (update.key === "showHistoryInBar") {
        setShowHistoryInBar(update.value)
        return
      }
      if (update.key === "trayProviderSelection") {
        setTrayProviderSelection(update.value)
        scheduleTrayIconUpdate("settings", 0)
        return
      }
      setMenubarIconStyle(update.value)
      scheduleTrayIconUpdate("settings", 0)
    })
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch((error) => {
        console.error("Failed to listen for display preference updates:", error)
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [
    scheduleTrayIconUpdate,
    setAccentColor,
    setDisplayMode,
    setMenubarIconStyle,
    setTrayProviderSelection,
    setResetTimerDisplayMode,
    setSurfacePins,
    setShowHistoryInBar,
    setThemeMode,
    setTimeFormatMode,
  ])
}
