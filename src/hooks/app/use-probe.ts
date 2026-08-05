import { useCallback, useMemo } from "react"
import { useProbeEvents } from "@/hooks/use-probe-events"
import { type AutoUpdateIntervalMinutes, type PluginSettings } from "@/lib/settings"
import { useProbeAutoUpdate } from "@/hooks/app/use-probe-auto-update"
import { useProbeRefreshActions } from "@/hooks/app/use-probe-refresh-actions"
import { useProbeState } from "@/hooks/app/use-probe-state"
import { providerInstanceRef } from "@/lib/provider-instance"
import type { ProviderConfigs } from "@/lib/provider-settings"
import type { ProviderInstanceRef } from "@/lib/plugin-types"

type UseProbeArgs = {
  pluginSettings: PluginSettings | null
  autoUpdateInterval: AutoUpdateIntervalMinutes
  providerConfigs?: ProviderConfigs
  onProbeResult?: () => void
}

export function useProbe({
  pluginSettings,
  autoUpdateInterval,
  providerConfigs = {},
  onProbeResult,
}: UseProbeArgs) {
  const providerInstanceRefs = useMemo<Record<string, ProviderInstanceRef>>(
    () =>
      Object.fromEntries(
        Object.entries(providerConfigs).map(([providerId, config]) => [
          providerId,
          providerInstanceRef(providerId, config),
        ])
      ),
    [providerConfigs]
  )

  const {
    pluginStates,
    pluginStatesRef,
    manualRefreshIdsRef,
    setLoadingForPlugins,
    setErrorForPlugins,
    handleProbeResult,
  } = useProbeState({ onProbeResult, providerInstanceRefs })

  const handleBatchComplete = useCallback(() => {}, [])

  const { startBatch } = useProbeEvents({
    onResult: handleProbeResult,
    onBatchComplete: handleBatchComplete,
  })

  const startBatchWithInstances = useCallback(
    (pluginIds?: string[]) => {
      const ids = pluginIds ?? Object.keys(providerInstanceRefs)
      const instanceRefs = ids.map(
        (providerId) => providerInstanceRefs[providerId] ?? { providerId }
      )
      return startBatch(pluginIds, instanceRefs)
    },
    [providerInstanceRefs, startBatch]
  )

  const { autoUpdateNextAt, setAutoUpdateNextAt, resetAutoUpdateSchedule } = useProbeAutoUpdate({
    pluginSettings,
    autoUpdateInterval,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch: startBatchWithInstances,
  })

  const { handleRetryPlugin, handleRefreshAll } = useProbeRefreshActions({
    pluginSettings,
    pluginStatesRef,
    manualRefreshIdsRef,
    resetAutoUpdateSchedule,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch: startBatchWithInstances,
  })

  return {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch: startBatchWithInstances,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  }
}
