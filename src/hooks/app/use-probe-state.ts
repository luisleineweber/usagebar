import { useCallback, useEffect, useRef, useState } from "react"
import type { PluginOutput, ProviderInstanceRef, ProviderUsageHistory } from "@/lib/plugin-types"
import { sameProviderInstance } from "@/lib/provider-instance"
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
  providerInstanceRefs?: Readonly<Record<string, ProviderInstanceRef>>
}

export function useProbeState({ onProbeResult, providerInstanceRefs = {} }: UseProbeStateArgs) {
  const [pluginStates, setPluginStates] = useState<Record<string, PluginState>>({})

  const providerInstanceRefsRef = useRef(providerInstanceRefs)
  providerInstanceRefsRef.current = providerInstanceRefs

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
        const currentRef = providerInstanceRefsRef.current[id]
        const existingRef = existing?.instanceRef ?? existing?.data?.instanceRef
        const sameInstance =
          !currentRef ||
          (existingRef !== undefined && sameProviderInstance(existingRef, currentRef))
        const retainedData = sameInstance
          ? (existing?.data ?? existing?.lastSettledData ?? null)
          : null
        const retainedSettledData = sameInstance
          ? (existing?.lastSettledData ?? existing?.data ?? null)
          : null
        next[id] = {
          data: retainedData,
          lastSettledData: retainedSettledData,
          instanceRef: currentRef ?? existing?.instanceRef,
          loading: true,
          error: null,
          errorCategory: null,
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
        const currentRef = providerInstanceRefsRef.current[id]
        const existingRef = existing?.instanceRef ?? existing?.data?.instanceRef
        const sameInstance =
          !currentRef ||
          (existingRef !== undefined && sameProviderInstance(existingRef, currentRef))
        const retainedData = sameInstance
          ? (existing?.data ?? existing?.lastSettledData ?? null)
          : null
        const retainedSettledData = sameInstance
          ? (existing?.lastSettledData ?? existing?.data ?? null)
          : null
        next[id] = {
          data: retainedData,
          lastSettledData: retainedSettledData,
          instanceRef: currentRef ?? existing?.instanceRef,
          loading: false,
          error,
          errorCategory: null,
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
      const expectedRef = providerInstanceRefsRef.current[output.providerId]
      if (expectedRef && !sameProviderInstance(output.instanceRef, expectedRef)) return
      const existingState = pluginStatesRef.current[output.providerId]
      const existingRef = existingState?.instanceRef ?? existingState?.data?.instanceRef
      if (
        !expectedRef &&
        existingRef &&
        output.instanceRef &&
        !sameProviderInstance(output.instanceRef, existingRef) &&
        !existingState?.loading
      ) {
        return
      }

      const errorMessage = getErrorMessage(output)
      const isManual = manualRefreshIdsRef.current.has(output.providerId)
      if (isManual) {
        manualRefreshIdsRef.current.delete(output.providerId)
      }

      setPluginStates((prev) => {
        const existing = prev[output.providerId]
        const capturedAt = Date.now()
        const settledOutput =
          !errorMessage && !output.history
            ? {
                ...output,
                history: existing?.data?.history ?? existing?.lastSettledData?.history,
              }
            : output
        return {
          ...prev,
          [output.providerId]: {
            data: errorMessage
              ? (existing?.data ?? existing?.lastSettledData ?? null)
              : settledOutput,
            lastSettledData: errorMessage
              ? (existing?.lastSettledData ?? existing?.data ?? null)
              : settledOutput,
            instanceRef: output.instanceRef ?? existing?.instanceRef,
            history: errorMessage
              ? existing?.history
              : appendUsageHistory(existing?.history, settledOutput, capturedAt),
            loading: false,
            error: errorMessage,
            errorCategory: errorMessage ? (output.error?.category ?? "unknown") : null,
            lastManualRefreshAt:
              !errorMessage && isManual ? capturedAt : (existing?.lastManualRefreshAt ?? null),
            lastSuccessAt: !errorMessage ? capturedAt : (existing?.lastSuccessAt ?? null),
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
