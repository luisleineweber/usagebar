import { useCallback, useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useShallow } from "zustand/react/shallow"
import { SettingsPage } from "@/pages/settings"
import { useProbe } from "@/hooks/app/use-probe"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { parseSettingsWindowLocation, type SettingsWindowTab } from "@/lib/settings-window"
import {
  clearProviderSecretMetadata,
  loadProviderConfigs,
  saveProviderConfigs,
  setProviderSecretMetadata,
  updateProviderConfig,
  type ProviderConfig,
} from "@/lib/provider-settings"
import { deleteProviderSecret, setProviderSecret } from "@/lib/provider-secrets"
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
  const [settingsTab, setSettingsTab] = useState<SettingsWindowTab>(initialTargetRef.current.tab ?? "general")
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
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
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
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
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
  })

  const { scheduleTrayIconUpdate } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    activeView: "home",
  })

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

  const { handleReorder, handleToggle } = useSettingsPluginActions({
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
        void getCurrentWindow().hide().catch((error) => {
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

    void listen<SettingsOpenPayload>("settings:open", (event) => {
      scheduleAutoCloseRef.current()
      const nextTab = event.payload.tab === "providers" ? "providers" : "general"
      setSettingsTab(nextTab)
      if (event.payload.providerId !== undefined) {
        setSelectedProviderId(event.payload.providerId ?? null)
      }
    }).then((dispose) => {
      unlisten = dispose
    }).catch((error) => {
      console.error("Failed to listen for settings window events:", error)
    })

    return () => {
      unlisten?.()
    }
  }, [])

  const providerConfigsRef = useRef(providerConfigs)
  useEffect(() => {
    providerConfigsRef.current = providerConfigs
  }, [providerConfigs])

  const persistProviderConfigs = useCallback(
    async (nextConfigs: typeof providerConfigs) => {
      setProviderConfigs(nextConfigs)
      await saveProviderConfigs(nextConfigs)
    },
    [setProviderConfigs]
  )

  const handleProviderConfigChange = useCallback(
    async (providerId: string, patch: Partial<ProviderConfig>) => {
      const nextConfigs = updateProviderConfig(providerConfigsRef.current, providerId, patch)
      await persistProviderConfigs(nextConfigs)
    },
    [persistProviderConfigs]
  )

  const handleProviderSecretSave = useCallback(
    async (providerId: string, secretKey: string, value: string) => {
      try {
        await setProviderSecret(providerId, secretKey, value)
        const nextConfigs = setProviderSecretMetadata(
          providerConfigsRef.current,
          providerId,
          secretKey
        )
        await persistProviderConfigs(nextConfigs)
      } catch (error) {
        console.error("Failed to save provider secret:", error)
        throw error
      }
    },
    [persistProviderConfigs]
  )

  const handleProviderSecretDelete = useCallback(
    async (providerId: string, secretKey: string) => {
      try {
        await deleteProviderSecret(providerId, secretKey)
        const nextConfigs = clearProviderSecretMetadata(
          providerConfigsRef.current,
          providerId,
          secretKey
        )
        await persistProviderConfigs(nextConfigs)
      } catch (error) {
        console.error("Failed to delete provider secret:", error)
        throw error
      }
    },
    [persistProviderConfigs]
  )

  const handleSelectedProviderChange = useCallback(
    (providerId: string, options?: SelectedProviderChangeOptions) => {
      setSelectedProviderId(providerId)
      if (options?.revealInTray) {
        void (async () => {
          try {
            await getCurrentWindow().hide()
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

  return (
    <div className="min-h-screen bg-background px-6 py-6 text-foreground md:px-10 md:py-10">
      <div className="mx-auto w-full max-w-7xl">
        <SettingsPage
          providers={settingsPlugins}
          selectedProviderId={selectedProviderId}
          onSelectedProviderChange={handleSelectedProviderChange}
          settingsTab={settingsTab}
          onSettingsTabChange={setSettingsTab}
          onReorder={handleReorder}
          onToggle={handleToggle}
          autoUpdateInterval={autoUpdateInterval}
          onAutoUpdateIntervalChange={handleAutoUpdateIntervalChange}
          themeMode={themeMode}
          onThemeModeChange={handleThemeModeChange}
          displayMode={displayMode}
          onDisplayModeChange={handleDisplayModeChange}
          resetTimerDisplayMode={resetTimerDisplayMode}
          onResetTimerDisplayModeChange={handleResetTimerDisplayModeChange}
          globalShortcut={globalShortcut}
          onGlobalShortcutChange={handleGlobalShortcutChange}
          startOnLogin={startOnLogin}
          onStartOnLoginChange={handleStartOnLoginChange}
          onProviderConfigChange={handleProviderConfigChange}
          onProviderSecretSave={handleProviderSecretSave}
          onProviderSecretDelete={handleProviderSecretDelete}
          onRetryProvider={handleRetryPlugin}
        />
      </div>
    </div>
  )
}
