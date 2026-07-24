import { useCallback, useEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppShell } from "@/components/app/app-shell"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import { useAppRefreshOrchestration } from "@/hooks/app/use-app-refresh-orchestration"
import { useProbe } from "@/hooks/app/use-probe"
import { useProviderStatuses } from "@/hooks/app/use-provider-statuses"
import { useAppWindowSync } from "@/hooks/app/use-app-window-sync"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { useNotificationEvents } from "@/hooks/app/use-notification-events"
import { REFRESH_COOLDOWN_MS } from "@/lib/settings"
import { useProviderConfigActions } from "@/hooks/app/use-provider-config-actions"
import { type PluginContextAction } from "@/components/side-nav"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { notifyPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import { openSettingsWindow } from "@/lib/settings-window"

const TRAY_PROBE_DEBOUNCE_MS = 500

function App() {
  const { activeView, setActiveView } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
    }))
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
    surfacePins,
    setSurfacePins,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setGlobalShortcut,
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
      surfacePins: state.surfacePins,
      setSurfacePins: state.setSurfacePins,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setTimeFormatMode: state.setTimeFormatMode,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
    }))
  )

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {})
  const finishFirstRunRef = useRef<() => void>(() => {})
  const handleProbeResult = useCallback(() => {
    scheduleProbeTrayUpdateRef.current()
  }, [])

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    onProbeResult: handleProbeResult,
  })

  const providerStatuses = useProviderStatuses({
    pluginsMeta,
    pluginSettings,
  })

  useNotificationEvents({ pluginStates, providerStatuses, pluginsMeta })

  const { scheduleTrayIconUpdate } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    accentColor,
    menubarIconStyle,
    surfacePins,
    activeView,
    providerStatuses,
  })

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS)
    }
  }, [scheduleTrayIconUpdate])

  const { applyStartOnLogin, isFirstRun, finishFirstRun } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setAccentColor,
    setDisplayMode,
    setMenubarIconStyle,
    setSurfacePins,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useEffect(() => {
    finishFirstRunRef.current = finishFirstRun
  }, [finishFirstRun])

  useAppWindowSync({
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
  })

  const didOpenFirstRunRef = useRef(false)
  useEffect(() => {
    if (!isFirstRun || didOpenFirstRunRef.current) return
    didOpenFirstRunRef.current = true
    void openSettingsWindow({ tab: "providers" }).catch((error) => {
      console.error("Failed to open first-run onboarding:", error)
    })
  }, [isFirstRun])

  useSettingsTheme(themeMode, accentColor)

  const {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleTimeFormatModeChange,
  } = useSettingsDisplayActions({
    setThemeMode,
    setAccentColor,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setTimeFormatMode,
    setMenubarIconStyle,
    setSurfacePins,
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

  const { handleHide, handleReorder, handleToggle } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
    onPluginSettingsChange: notifyPluginSettingsUpdated,
  })

  const { handleProviderConfigChange, handleProviderSecretSave, handleProviderSecretDelete } =
    useProviderConfigActions({ providerConfigs, setProviderConfigs })

  const { displayPlugins, navPlugins, selectedPlugin, resolvedSelectedPlugin, hasResolvedViews } =
    useAppPluginViews({
      activeView,
      setActiveView,
      pluginSettings,
      pluginsMeta,
      pluginStates,
      providerStatuses,
    })

  const { handlePanelFocus } = useAppRefreshOrchestration({
    activeView,
    pluginSettings,
    pluginsMeta,
    pluginStates,
    isFirstRun,
    handleRetryPlugin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
    setThemeMode,
    setDisplayMode,
    setResetTimerDisplayMode,
    setMenubarIconStyle,
    setSurfacePins,
  })

  const handlePluginContextAction = useCallback(
    (pluginId: string, action: PluginContextAction) => {
      if (action === "reload") {
        handleRetryPlugin(pluginId)
        return
      }
      if (action === "arrange") {
        return
      }

      handleHide(pluginId)
      if (activeView === pluginId) setActiveView("home")
    },
    [activeView, handleHide, handleRetryPlugin, setActiveView]
  )

  const isPluginRefreshAvailable = useCallback(
    (pluginId: string) => {
      const pluginMeta = pluginsMeta.find((plugin) => plugin.id === pluginId)
      if (pluginMeta?.supportState === "comingSoonOnWindows") return false
      const pluginState = pluginStates[pluginId]
      if (!pluginState) return true
      if (pluginState.loading) return false
      if (!pluginState.lastManualRefreshAt) return true
      return Date.now() - pluginState.lastManualRefreshAt >= REFRESH_COOLDOWN_MS
    },
    [pluginStates, pluginsMeta]
  )

  return (
    <AppShell
      onRefreshAll={handleRefreshAll}
      onPanelFocus={handlePanelFocus}
      navPlugins={navPlugins}
      displayPlugins={displayPlugins}
      autoUpdateNextAt={autoUpdateNextAt}
      selectedPlugin={selectedPlugin}
      resolvedSelectedPlugin={resolvedSelectedPlugin}
      hasResolvedViews={hasResolvedViews}
      onPluginContextAction={handlePluginContextAction}
      isPluginRefreshAvailable={isPluginRefreshAvailable}
      onNavReorder={handleReorder}
      appContentProps={{
        onRetryPlugin: handleRetryPlugin,
        onReorder: handleReorder,
        onToggle: handleToggle,
        onProviderConfigChange: handleProviderConfigChange,
        onProviderSecretSave: handleProviderSecretSave,
        onProviderSecretDelete: handleProviderSecretDelete,
        onAutoUpdateIntervalChange: handleAutoUpdateIntervalChange,
        onThemeModeChange: handleThemeModeChange,
        onDisplayModeChange: handleDisplayModeChange,
        onResetTimerDisplayModeChange: handleResetTimerDisplayModeChange,
        onResetTimerDisplayModeToggle: handleResetTimerDisplayModeToggle,
        onTimeFormatModeChange: handleTimeFormatModeChange,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
      }}
    />
  )
}

export { App }
