import { useEffect, type RefObject } from "react"
import { listenDisplayPreferenceUpdated } from "@/lib/display-preference-events"
import { listenPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import type {
  AccentColor,
  DisplayMode,
  MenubarIconStyle,
  PluginSettings,
  ResetTimerDisplayMode,
  SurfacePin,
  ThemeMode,
  TimeFormatMode,
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
    setResetTimerDisplayMode,
    setSurfacePins,
    setThemeMode,
    setTimeFormatMode,
  ])
}
