import { useCallback, useEffect, useRef } from "react"
import {
  getProbeEligiblePluginIds,
  loadDisplayMode,
  loadMenubarIconStyle,
  loadResetTimerDisplayMode,
  loadSurfacePins,
  loadShowHistoryInBar,
  loadThemeMode,
  type PluginSettings,
  type SurfacePin,
  type ThemeMode,
  type DisplayMode,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
} from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"
import type { ActiveView } from "@/components/side-nav"
import type { PluginState } from "@/hooks/app/types"
import type { TrayUpdateReason } from "@/hooks/app/use-tray-icon"

type UseAppRefreshOrchestrationArgs = {
  activeView: ActiveView
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
  isFirstRun: boolean | null
  handleRetryPlugin: (pluginId: string) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
  scheduleTrayIconUpdate: (reason: TrayUpdateReason, delayMs?: number) => void
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setSurfacePins: (value: SurfacePin[]) => void
  setShowHistoryInBar: (value: boolean) => void
}

export function useAppRefreshOrchestration({
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
  setShowHistoryInBar,
}: UseAppRefreshOrchestrationArgs) {
  const catchUpProbeIdsRef = useRef<Set<string>>(new Set())

  const handlePanelFocus = useCallback(
    (targetView?: ActiveView) => {
      void Promise.all([
        loadThemeMode(),
        loadDisplayMode(),
        loadResetTimerDisplayMode(),
        loadMenubarIconStyle(),
        loadSurfacePins(pluginsMeta),
        loadShowHistoryInBar(),
      ])
        .then(
          ([
            nextThemeMode,
            nextDisplayMode,
            nextResetTimerDisplayMode,
            nextMenubarIconStyle,
            nextSurfacePins,
            nextShowHistoryInBar,
          ]) => {
            setThemeMode(nextThemeMode)
            setDisplayMode(nextDisplayMode)
            setResetTimerDisplayMode(nextResetTimerDisplayMode)
            setMenubarIconStyle(nextMenubarIconStyle)
            setSurfacePins(nextSurfacePins)
            setShowHistoryInBar(nextShowHistoryInBar)
            scheduleTrayIconUpdate("settings", 0)
          }
        )
        .catch((error) => {
          console.error("Failed to refresh display preferences on panel focus:", error)
        })

      if (!pluginSettings) return
      const supportedEnabledIds = getProbeEligiblePluginIds(pluginSettings, pluginsMeta)
      const explicitTargetView = targetView?.trim()

      const idsToRefresh =
        explicitTargetView && explicitTargetView !== "home" && explicitTargetView !== "settings"
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
    },
    [
      activeView,
      handleRetryPlugin,
      pluginSettings,
      pluginStates,
      pluginsMeta,
      scheduleTrayIconUpdate,
      setDisplayMode,
      setMenubarIconStyle,
      setResetTimerDisplayMode,
      setSurfacePins,
      setShowHistoryInBar,
      setThemeMode,
    ]
  )

  useEffect(() => {
    if (!pluginSettings || isFirstRun !== false) return

    const supportedEnabledIds = getProbeEligiblePluginIds(pluginSettings, pluginsMeta)
    const idsToCatchUp = supportedEnabledIds.filter((id) => {
      if (catchUpProbeIdsRef.current.has(id)) return false
      const state = pluginStates[id]
      if (!state) return true
      return (
        !state.loading &&
        state.data === null &&
        state.error === null &&
        state.lastSuccessAt === null
      )
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
  }, [
    isFirstRun,
    pluginSettings,
    pluginStates,
    pluginsMeta,
    setErrorForPlugins,
    setLoadingForPlugins,
    startBatch,
  ])

  return { handlePanelFocus }
}
