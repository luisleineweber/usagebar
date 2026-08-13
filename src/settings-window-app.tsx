import { useCallback, useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useShallow } from "zustand/react/shallow"
import { SettingsPage } from "@/pages/settings"
import { FirstRunOnboarding } from "@/components/onboarding/first-run-onboarding"
import { useProbe } from "@/hooks/app/use-probe"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useFirstRunOnboarding } from "@/hooks/app/use-first-run-onboarding"
import { buildTraySettingsPreview } from "@/lib/tray-preview"
import {
  notifySettingsWindowClosed,
  notifySettingsWindowState,
  parseSettingsWindowLocation,
  SETTINGS_WINDOW_OPEN_EVENT,
  type SettingsWindowTab,
} from "@/lib/settings-window"
import { useProviderConfigActions } from "@/hooks/app/use-provider-config-actions"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { showPanelForView } from "@/lib/panel-window"
import { notifyPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import type { SelectedProviderChangeOptions } from "@/lib/settings-window"

type SettingsOpenPayload = {
  tab?: SettingsWindowTab
  providerId?: string | null
}

export const SETTINGS_AUTO_CLOSE_DELAY_MS = 5 * 60 * 1000

export function SettingsWindowApp() {
  const initialTargetRef = useRef(parseSettingsWindowLocation(window.location.search))
  const autoCloseTimerRef = useRef<number | null>(null)
  const scheduleAutoCloseRef = useRef<() => void>(() => {})
  const [settingsTab, setSettingsTab] = useState<SettingsWindowTab>(
    initialTargetRef.current.tab ?? "general"
  )
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    initialTargetRef.current.providerId ?? null
  )

  const {
    pluginsMeta,
    setPluginsMeta,
    pluginSettings,
    setPluginSettings,
    providerConfigs,
    setProviderConfigs,
  } = useAppPluginStore(
    useShallow((state) => ({
      pluginsMeta: state.pluginsMeta,
      setPluginsMeta: state.setPluginsMeta,
      pluginSettings: state.pluginSettings,
      setPluginSettings: state.setPluginSettings,
      providerConfigs: state.providerConfigs,
      setProviderConfigs: state.setProviderConfigs,
    }))
  )

  const {
    autoUpdateInterval,
    setAutoUpdateInterval,
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    trayProviderSelection,
    setTrayProviderSelection,
    setSurfacePins,
    showHistoryInBar,
    setShowHistoryInBar,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    timeFormatMode,
    setTimeFormatMode,
    globalShortcut,
    setGlobalShortcut,
    startOnLogin,
    setStartOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      accentColor: state.accentColor,
      setAccentColor: state.setAccentColor,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      trayProviderSelection: state.trayProviderSelection,
      setTrayProviderSelection: state.setTrayProviderSelection,
      setSurfacePins: state.setSurfacePins,
      showHistoryInBar: state.showHistoryInBar,
      setShowHistoryInBar: state.setShowHistoryInBar,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      timeFormatMode: state.timeFormatMode,
      setTimeFormatMode: state.setTimeFormatMode,
      globalShortcut: state.globalShortcut,
      setGlobalShortcut: state.setGlobalShortcut,
      startOnLogin: state.startOnLogin,
      setStartOnLogin: state.setStartOnLogin,
    }))
  )

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    setAutoUpdateNextAt,
    handleRetryPlugin,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    providerConfigs,
  })

  const scheduleTrayIconUpdate = useCallback(() => {}, [])
  const { preview: traySettingsPreview } = buildTraySettingsPreview({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
  })

  const { applyStartOnLogin, isFirstRun, finishFirstRun } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setAccentColor,
    setDisplayMode,
    setMenubarIconStyle,
    setTrayProviderSelection,
    setSurfacePins,
    setShowHistoryInBar,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useSettingsTheme(themeMode, accentColor)

  const {
    handleThemeModeChange,
    handleAccentColorChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleTimeFormatModeChange,
    handleMenubarIconStyleChange,
    handleTrayProviderSelectionChange,
    handleShowHistoryInBarChange,
  } = useSettingsDisplayActions({
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
  })

  const { handleAutoUpdateIntervalChange, handleGlobalShortcutChange, handleStartOnLoginChange } =
    useSettingsSystemActions({
      pluginSettings,
      setAutoUpdateInterval,
      setAutoUpdateNextAt,
      setGlobalShortcut,
      setStartOnLogin,
      applyStartOnLogin,
    })

  const { handleHide, handleToggle } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
    onPluginSettingsChange: notifyPluginSettingsUpdated,
  })

  const settingsPlugins = useSettingsPluginList({
    pluginSettings,
    pluginsMeta,
    pluginStates,
    providerConfigs,
  })

  useEffect(() => {
    const settingsWindow = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | undefined

    const handleFocusChanged = () => {
      void settingsWindow
        .isMinimized()
        .then((isMinimized) => {
          if (disposed) return
          return notifySettingsWindowState(isMinimized)
        })
        .catch((error) => {
          console.error("Failed to publish settings window state:", error)
        })
    }

    void settingsWindow
      .onFocusChanged(handleFocusChanged)
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        unlisten = dispose
      })
      .catch((error) => {
        console.error("Failed to listen for settings window focus changes:", error)
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.window = "settings"

    return () => {
      delete document.documentElement.dataset.window
    }
  }, [])

  useEffect(() => {
    const clearAutoCloseTimer = () => {
      if (autoCloseTimerRef.current === null) return
      window.clearTimeout(autoCloseTimerRef.current)
      autoCloseTimerRef.current = null
    }

    const scheduleAutoClose = () => {
      clearAutoCloseTimer()
      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null
        void getCurrentWindow()
          .hide()
          .then(() => notifySettingsWindowClosed())
          .catch((error) => {
            console.error("Failed to auto-close settings window:", error)
          })
      }, SETTINGS_AUTO_CLOSE_DELAY_MS)
    }

    const handleActivity = () => {
      scheduleAutoClose()
    }

    scheduleAutoCloseRef.current = scheduleAutoClose
    scheduleAutoClose()

    window.addEventListener("focus", handleActivity)
    window.addEventListener("keydown", handleActivity)
    window.addEventListener("pointerdown", handleActivity, { passive: true })
    window.addEventListener("wheel", handleActivity, { passive: true })
    window.addEventListener("scroll", handleActivity, { passive: true, capture: true })

    return () => {
      clearAutoCloseTimer()
      scheduleAutoCloseRef.current = () => {}
      window.removeEventListener("focus", handleActivity)
      window.removeEventListener("keydown", handleActivity)
      window.removeEventListener("pointerdown", handleActivity)
      window.removeEventListener("wheel", handleActivity)
      window.removeEventListener("scroll", handleActivity, { capture: true })
    }
  }, [])

  const {
    providerConfigLoadError,
    retryProviderConfigs,
    handleProviderConfigChange,
    handleProviderSecretSave,
    handleProviderSecretDelete,
  } = useProviderConfigActions({ providerConfigs, setProviderConfigs })

  useEffect(() => {
    const target = initialTargetRef.current
    if (target.tab) {
      setSettingsTab(target.tab)
    }
    if (target.providerId) {
      setSelectedProviderId(target.providerId)
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void listen<SettingsOpenPayload>(SETTINGS_WINDOW_OPEN_EVENT, (event) => {
      scheduleAutoCloseRef.current()
      const nextTab = event.payload.tab === "providers" ? "providers" : "general"
      setSettingsTab(nextTab)
      if (event.payload.providerId !== undefined) {
        setSelectedProviderId(event.payload.providerId ?? null)
      }
    })
      .then((dispose) => {
        unlisten = dispose
      })
      .catch((error) => {
        console.error("Failed to listen for settings window events:", error)
      })

    return () => {
      unlisten?.()
    }
  }, [])

  const handleSelectedProviderChange = useCallback(
    (providerId: string, options?: SelectedProviderChangeOptions) => {
      setSelectedProviderId(providerId)
      if (options?.revealInTray) {
        void (async () => {
          try {
            await getCurrentWindow().hide()
            await notifySettingsWindowClosed()
          } catch (error) {
            console.error("Failed to hide settings window before tray handoff:", error)
          }

          await showPanelForView(providerId)
        })().catch((error) => {
          console.error("Failed to reveal selected provider in tray panel:", error)
        })
        return
      }
    },
    []
  )

  const { connectProviders, finishOnboarding } = useFirstRunOnboarding({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
    finishFirstRun,
  })

  return (
    <div className="min-h-screen bg-background px-6 py-6 text-foreground md:px-10 md:py-10">
      <div className="mx-auto w-full max-w-7xl">
        {isFirstRun === true ? (
          <FirstRunOnboarding
            providers={settingsPlugins}
            onConnect={connectProviders}
            onRetry={handleRetryPlugin}
            onSecretSave={handleProviderSecretSave}
            onFinish={finishOnboarding}
          />
        ) : isFirstRun === false ? (
          <SettingsPage
            providers={settingsPlugins}
            selectedProviderId={selectedProviderId}
            onSelectedProviderChange={handleSelectedProviderChange}
            settingsTab={settingsTab}
            onSettingsTabChange={setSettingsTab}
            onToggle={handleToggle}
            onShow={(id) => handleHide(id)}
            autoUpdateInterval={autoUpdateInterval}
            onAutoUpdateIntervalChange={handleAutoUpdateIntervalChange}
            themeMode={themeMode}
            onThemeModeChange={handleThemeModeChange}
            accentColor={accentColor}
            onAccentColorChange={handleAccentColorChange}
            displayMode={displayMode}
            onDisplayModeChange={handleDisplayModeChange}
            resetTimerDisplayMode={resetTimerDisplayMode}
            onResetTimerDisplayModeChange={handleResetTimerDisplayModeChange}
            timeFormatMode={timeFormatMode}
            onTimeFormatModeChange={handleTimeFormatModeChange}
            menubarIconStyle={menubarIconStyle}
            onMenubarIconStyleChange={handleMenubarIconStyleChange}
            trayProviderSelection={trayProviderSelection}
            onTrayProviderSelectionChange={handleTrayProviderSelectionChange}
            showHistoryInBar={showHistoryInBar}
            onShowHistoryInBarChange={handleShowHistoryInBarChange}
            traySettingsPreview={traySettingsPreview}
            globalShortcut={globalShortcut}
            onGlobalShortcutChange={handleGlobalShortcutChange}
            startOnLogin={startOnLogin}
            onStartOnLoginChange={handleStartOnLoginChange}
            onProviderConfigChange={handleProviderConfigChange}
            onProviderSecretSave={handleProviderSecretSave}
            onProviderSecretDelete={handleProviderSecretDelete}
            onRetryProvider={handleRetryPlugin}
            providerConfigLoadError={providerConfigLoadError}
            onRetryProviderConfigs={retryProviderConfigs}
          />
        ) : (
          <div className="flex min-h-[624px] items-center justify-center text-sm text-muted-foreground">
            Einstellungen werden geladen…
          </div>
        )}
      </div>
    </div>
  )
}
