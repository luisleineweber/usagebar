import { useCallback, useEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppShell } from "@/components/app/app-shell"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import { useProbe } from "@/hooks/app/use-probe"
import { useProviderStatuses } from "@/hooks/app/use-provider-statuses"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { track } from "@/lib/analytics"
import {
  getProbeEligiblePluginIds,
  loadDisplayMode,
  loadMenubarIconStyle,
  loadResetTimerDisplayMode,
  loadThemeMode,
  REFRESH_COOLDOWN_MS,
  savePluginSettings,
} from "@/lib/settings"
import {
  clearProviderSecretMetadata,
  loadProviderConfigs,
  saveProviderConfigs,
  setProviderSecretMetadata,
  updateProviderConfig,
  type ProviderConfig,
} from "@/lib/provider-settings"
import { deleteProviderSecret, setProviderSecret } from "@/lib/provider-secrets"
import { type PluginContextAction } from "@/components/side-nav"
import type { ActiveView } from "@/components/side-nav"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import { listenPluginSettingsUpdated, notifyPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import { listenDisplayPreferenceUpdated } from "@/lib/display-preference-events"

const TRAY_PROBE_DEBOUNCE_MS = 500
const TRAY_SETTINGS_DEBOUNCE_MS = 2000

function App() {
  const {
    activeView,
    setActiveView,
  } = useAppUiStore(
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
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
    }))
  )

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {})
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

  const { scheduleTrayIconUpdate, traySettingsPreview } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    activeView,
    providerStatuses,
  })

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS)
    }
  }, [scheduleTrayIconUpdate])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    void listenPluginSettingsUpdated((nextSettings) => {
      setPluginSettings(nextSettings)
      scheduleTrayIconUpdate("settings", 0)
    }).then((dispose) => {
      if (disposed) {
        dispose()
        return
      }
      unlisten = dispose
    }).catch((error) => {
      console.error("Failed to listen for plugin settings updates:", error)
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [scheduleTrayIconUpdate, setPluginSettings])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let disposed = false

    void listenDisplayPreferenceUpdated((update) => {
      if (update.key === "themeMode") {
        setThemeMode(update.value)
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
      setMenubarIconStyle(update.value)
      scheduleTrayIconUpdate("settings", 0)
    }).then((dispose) => {
      if (disposed) {
        dispose()
        return
      }
      unlisten = dispose
    }).catch((error) => {
      console.error("Failed to listen for display preference updates:", error)
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [scheduleTrayIconUpdate, setDisplayMode, setMenubarIconStyle, setResetTimerDisplayMode, setThemeMode])

  const { applyStartOnLogin } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setDisplayMode,
    setMenubarIconStyle,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
  })

  useSettingsTheme(themeMode)

  const {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleMenubarIconStyleChange,
  } = useSettingsDisplayActions({
    setThemeMode,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setMenubarIconStyle,
    scheduleTrayIconUpdate,
  })

  const {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
  } = useSettingsSystemActions({
    pluginSettings,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setGlobalShortcut,
    setStartOnLogin,
    applyStartOnLogin,
  })

  const {
    handleReorder,
    handleToggle,
  } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
    onPluginSettingsChange: notifyPluginSettingsUpdated,
  })

  useEffect(() => {
    let cancelled = false

    loadProviderConfigs()
      .then((configs) => {
        if (!cancelled) {
          setProviderConfigs(configs)
        }
      })
      .catch((error) => {
        console.error("Failed to load provider configs:", error)
      })

    return () => {
      cancelled = true
    }
  }, [setProviderConfigs])

  const { displayPlugins, navPlugins, selectedPlugin, resolvedSelectedPlugin, hasResolvedViews } = useAppPluginViews({
    activeView,
    setActiveView,
    pluginSettings,
    pluginsMeta,
    pluginStates,
    providerStatuses,
  })

  const providerConfigsRef = useRef(providerConfigs)
  useEffect(() => {
    providerConfigsRef.current = providerConfigs
  }, [providerConfigs])

  const catchUpProbeIdsRef = useRef<Set<string>>(new Set())

  const persistProviderConfigs = useCallback(async (nextConfigs: typeof providerConfigs) => {
    setProviderConfigs(nextConfigs)
    await saveProviderConfigs(nextConfigs)
  }, [setProviderConfigs])

  const handleProviderConfigChange = useCallback(async (
    providerId: string,
    patch: Partial<ProviderConfig>
  ) => {
    const nextConfigs = updateProviderConfig(providerConfigsRef.current, providerId, patch)
    await persistProviderConfigs(nextConfigs)
  }, [persistProviderConfigs])

  const handleProviderSecretSave = useCallback(async (
    providerId: string,
    secretKey: string,
    value: string
  ) => {
    try {
      await setProviderSecret(providerId, secretKey, value)
      const nextConfigs = setProviderSecretMetadata(providerConfigsRef.current, providerId, secretKey)
      await persistProviderConfigs(nextConfigs)
    } catch (error) {
      console.error("Failed to save provider secret:", error)
      throw error
    }
  }, [persistProviderConfigs])

  const handleProviderSecretDelete = useCallback(async (
    providerId: string,
    secretKey: string
  ) => {
    try {
      await deleteProviderSecret(providerId, secretKey)
      const nextConfigs = clearProviderSecretMetadata(providerConfigsRef.current, providerId, secretKey)
      await persistProviderConfigs(nextConfigs)
    } catch (error) {
      console.error("Failed to delete provider secret:", error)
      throw error
    }
  }, [persistProviderConfigs])

  const handlePanelFocus = useCallback((targetView?: ActiveView) => {
    void Promise.all([
      loadThemeMode(),
      loadDisplayMode(),
      loadResetTimerDisplayMode(),
      loadMenubarIconStyle(),
    ])
      .then(([nextThemeMode, nextDisplayMode, nextResetTimerDisplayMode, nextMenubarIconStyle]) => {
        setThemeMode(nextThemeMode)
        setDisplayMode(nextDisplayMode)
        setResetTimerDisplayMode(nextResetTimerDisplayMode)
        setMenubarIconStyle(nextMenubarIconStyle)
        scheduleTrayIconUpdate("settings", 0)
      })
      .catch((error) => {
        console.error("Failed to refresh display preferences on panel focus:", error)
      })

    if (!pluginSettings) return
    const supportedEnabledIds = getProbeEligiblePluginIds(pluginSettings, pluginsMeta)
    const explicitTargetView = targetView?.trim()

    const idsToRefresh = explicitTargetView && explicitTargetView !== "home" && explicitTargetView !== "settings"
      ? supportedEnabledIds.filter((id) => id === explicitTargetView)
      : activeView !== "home" && activeView !== "settings"
      ? supportedEnabledIds.filter((id) => id === activeView)
      : supportedEnabledIds.filter((id) => {
          const state = pluginStates[id]
          if (!state) return true
          if (state.loading) return false
          return state.error !== null || state.data === null
        })

    for (const id of idsToRefresh) {
      handleRetryPlugin(id)
    }
  }, [
    activeView,
    handleRetryPlugin,
    pluginSettings,
    pluginStates,
    pluginsMeta,
    scheduleTrayIconUpdate,
    setDisplayMode,
    setMenubarIconStyle,
    setResetTimerDisplayMode,
    setThemeMode,
  ])

  useEffect(() => {
    if (!pluginSettings) return

    const supportedEnabledIds = getProbeEligiblePluginIds(pluginSettings, pluginsMeta)
    const idsToCatchUp = supportedEnabledIds.filter((id) => {
      if (catchUpProbeIdsRef.current.has(id)) return false
      const state = pluginStates[id]
      if (!state) return true
      return !state.loading && state.data === null && state.error === null && state.lastSuccessAt === null
    })

    if (idsToCatchUp.length === 0) return

    for (const id of idsToCatchUp) {
      catchUpProbeIdsRef.current.add(id)
    }

    setLoadingForPlugins(idsToCatchUp)
    startBatch(idsToCatchUp)
      .then((startedIds) => {
        if (startedIds && startedIds.length > 0) return
        for (const id of idsToCatchUp) {
          catchUpProbeIdsRef.current.delete(id)
        }
      })
      .catch((error) => {
        for (const id of idsToCatchUp) {
          catchUpProbeIdsRef.current.delete(id)
        }
        console.error("Failed to start catch-up probe batch:", error)
        setErrorForPlugins(idsToCatchUp, "Failed to start probe")
      })
  }, [pluginSettings, pluginStates, pluginsMeta, setErrorForPlugins, setLoadingForPlugins, startBatch])

  const pluginSettingsRef = useRef(pluginSettings)
  useEffect(() => {
    pluginSettingsRef.current = pluginSettings
  }, [pluginSettings])

  const handlePluginContextAction = useCallback(
    (pluginId: string, action: PluginContextAction) => {
      if (action === "reload") {
        handleRetryPlugin(pluginId)
        return
      }
      if (action === "arrange") {
        track("providers_arrange_started", { provider_id: pluginId })
        return
      }

      const currentSettings = pluginSettingsRef.current
      if (!currentSettings) return
      const alreadyDisabled = currentSettings.disabled.includes(pluginId)
      if (alreadyDisabled) return

      track("provider_toggled", { provider_id: pluginId, enabled: "false" })
      const nextSettings = {
        ...currentSettings,
        disabled: [...currentSettings.disabled, pluginId],
      }
      setPluginSettings(nextSettings)
      scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
      void savePluginSettings(nextSettings).catch((error) => {
        console.error("Failed to save plugin toggle:", error)
      })

      if (activeView === pluginId) {
        setActiveView("home")
      }
    },
    [activeView, handleRetryPlugin, scheduleTrayIconUpdate, setActiveView, setPluginSettings]
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
        onMenubarIconStyleChange: handleMenubarIconStyleChange,
        traySettingsPreview,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
      }}
    />
  )
}

export { App }
