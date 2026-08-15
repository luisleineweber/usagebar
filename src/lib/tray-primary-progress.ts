import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"
import type { PluginSettings, SurfacePin } from "@/lib/settings"
import { DEFAULT_DISPLAY_MODE, type DisplayMode } from "@/lib/settings"
import { clamp01 } from "@/lib/utils"
import { sameProviderInstance } from "@/lib/provider-instance"

type PluginState = {
  data: PluginOutput | null
  loading: boolean
  error: string | null
}

export type TrayPrimaryBar = {
  id: string
  fraction?: number
}

type ProgressLine = Extract<PluginOutput["lines"][number], { type: "progress" }>

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress"
}

function progressFraction(
  line: ProgressLine | undefined,
  displayMode: DisplayMode
): number | undefined {
  if (
    !line ||
    line.availability !== undefined ||
    typeof line.used !== "number" ||
    !Number.isFinite(line.used) ||
    typeof line.limit !== "number" ||
    !Number.isFinite(line.limit) ||
    line.limit <= 0
  ) {
    return undefined
  }
  const shownAmount = displayMode === "used" ? line.used : line.limit - line.used
  return clamp01(shownAmount / line.limit)
}

export function getTrayPrimaryBars(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  maxBars?: number
  displayMode?: DisplayMode
  pluginId?: string
}): TrayPrimaryBar[] {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    maxBars = 4,
    displayMode = DEFAULT_DISPLAY_MODE,
    pluginId,
  } = args
  if (!pluginSettings) return []

  const metaById = new Map(pluginsMeta.map((p) => [p.id, p]))
  const disabled = new Set(pluginSettings.disabled)
  const orderedIds = pluginId ? [pluginId] : pluginSettings.order

  const out: TrayPrimaryBar[] = []
  for (const id of orderedIds) {
    if (disabled.has(id)) continue
    const meta = metaById.get(id)
    if (!meta) continue

    // Skip if no primary candidates defined
    if (!meta.primaryCandidates || meta.primaryCandidates.length === 0) continue

    const state = pluginStates[id]
    const data = state?.data ?? null

    let fraction: number | undefined
    if (data) {
      // Find first candidate that exists in runtime data
      const primaryLabel = meta.primaryCandidates.find((label) =>
        data.lines.some((line) => isProgressLine(line) && line.label === label)
      )
      if (primaryLabel) {
        const primaryLine = data.lines.find(
          (line): line is ProgressLine => isProgressLine(line) && line.label === primaryLabel
        )
        fraction = progressFraction(primaryLine, displayMode)
      }
    }

    out.push({ id, fraction })
    if (out.length >= maxBars) break
  }

  return out
}

export function getTrayPinnedBars(args: {
  pins: readonly SurfacePin[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  displayMode?: DisplayMode
}): TrayPrimaryBar[] {
  const { pins, pluginSettings, pluginStates, displayMode = DEFAULT_DISPLAY_MODE } = args
  if (!pluginSettings) return []
  const disabled = new Set(pluginSettings.disabled)

  return pins
    .filter((pin) => !disabled.has(pin.providerId))
    .map((pin) => {
      const line = pluginStates[pin.providerId]?.data?.lines.find(
        (candidate): candidate is ProgressLine =>
          isProgressLine(candidate) &&
          candidate.label === pin.metricLabel &&
          (!pin.instanceRef ||
            sameProviderInstance(pluginStates[pin.providerId]?.data?.instanceRef, pin.instanceRef))
      )
      const fraction = progressFraction(line, displayMode)
      return {
        id: `${pin.providerId}${pin.instanceRef?.instanceId ? `:${pin.instanceRef.instanceId}` : ""}:${pin.metricLabel}`,
        fraction,
      }
    })
}
