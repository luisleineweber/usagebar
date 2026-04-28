import { useCallback, useEffect, useRef, useState } from "react"
import type { PluginOutput, ProviderUsageHistory } from "@/lib/plugin-types"
import type { PluginState } from "@/hooks/app/types"

const MAX_HISTORY_POINTS_PER_PROVIDER = 240

function appendUsageHistory(
  history: ProviderUsageHistory | undefined,
  output: PluginOutput,
  capturedAt: number
): ProviderUsageHistory | undefined {
  const points = output.lines
    .filter((line) => line.type === "progress")
    .map((line) => ({
      capturedAt,
      label: line.label,
      used: line.used,
      limit: line.limit,
      format: line.format,
      color: line.color,
    }))

  if (points.length === 0) return history

  return {
    points: [...(history?.points ?? []), ...points].slice(-MAX_HISTORY_POINTS_PER_PROVIDER),
  }
}

type UseProbeStateArgs = {
  onProbeResult?: () => void
}

export function useProbeState({ onProbeResult }: UseProbeStateArgs) {
  const [pluginStates, setPluginStates] = useState<Record<string, PluginState>>({})

  const pluginStatesRef = useRef(pluginStates)
  useEffect(() => {
    pluginStatesRef.current = pluginStates
  }, [pluginStates])

  const manualRefreshIdsRef = useRef<Set<string>>(new Set())

  const getErrorMessage = useCallback((output: PluginOutput) => {
    if (output.lines.length !== 1) return null
    const line = output.lines[0]
    if (line.type === "badge" && line.label === "Error") {
      return line.text || "Couldn't update data. Try again?"
    }
    return null
  }, [])

  const setLoadingForPlugins = useCallback((ids: string[]) => {
    setPluginStates((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        const existing = prev[id]
        const retainedData = existing?.data ?? existing?.lastSettledData ?? null
        next[id] = {
          data: retainedData,
          lastSettledData: existing?.lastSettledData ?? existing?.data ?? null,
          loading: true,
          error: null,
          history: existing?.history,
          lastManualRefreshAt: existing?.lastManualRefreshAt ?? null,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
        }
      }
      return next
    })
  }, [])

  const setErrorForPlugins = useCallback((ids: string[], error: string) => {
    setPluginStates((prev) => {
      const next = { ...prev }
      for (const id of ids) {
        const existing = prev[id]
        const retainedData = existing?.data ?? existing?.lastSettledData ?? null
        next[id] = {
          data: retainedData,
          lastSettledData: existing?.lastSettledData ?? existing?.data ?? null,
          loading: false,
          error,
          history: existing?.history,
          lastManualRefreshAt: existing?.lastManualRefreshAt ?? null,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
        }
      }
      return next
    })
  }, [])

  const handleProbeResult = useCallback(
    (output: PluginOutput) => {
      const errorMessage = getErrorMessage(output)
      const isManual = manualRefreshIdsRef.current.has(output.providerId)
      if (isManual) {
        manualRefreshIdsRef.current.delete(output.providerId)
      }

      setPluginStates((prev) => {
        const existing = prev[output.providerId]
        const capturedAt = Date.now()
        return {
          ...prev,
          [output.providerId]: {
            data: errorMessage ? existing?.data ?? existing?.lastSettledData ?? null : output,
            lastSettledData: errorMessage
              ? existing?.lastSettledData ?? existing?.data ?? null
              : output,
            history: errorMessage
              ? existing?.history
              : appendUsageHistory(existing?.history, output, capturedAt),
            loading: false,
            error: errorMessage,
            lastManualRefreshAt: !errorMessage && isManual
              ? capturedAt
              : existing?.lastManualRefreshAt ?? null,
            lastSuccessAt: !errorMessage
              ? capturedAt
              : existing?.lastSuccessAt ?? null,
          },
        }
      })

      onProbeResult?.()
    },
    [getErrorMessage, onProbeResult]
  )

  return {
    pluginStates,
    pluginStatesRef,
    manualRefreshIdsRef,
    setLoadingForPlugins,
    setErrorForPlugins,
    handleProbeResult,
  }
}
