import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta, PluginOutput, ProbeErrorCategory } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"

export type TrayUnknownReason =
  | "no-provider"
  | "no-data"
  | "no-primary-metric"
  | "invalid-limit"

export type TrayValueState = {
  kind: "value"
  providerId: string
  providerName: string
  metricLabel: string
  remainingPercentExact: number
  resetsAt: string | null
}

export type TrayUnknownState = {
  kind: "unknown"
  providerId: string | null
  providerName: string | null
  metricLabel: string | null
  reason: TrayUnknownReason
}

export type TrayErrorState = {
  kind: "error"
  providerId: string
  providerName: string
  metricLabel: string | null
  errorMessage: string
  errorCategory: ProbeErrorCategory | null
  lastKnownRemainingPercentExact: number | null
  lastKnownResetsAt: string | null
}

export type TrayState = TrayValueState | TrayUnknownState | TrayErrorState

type ProgressLine = Extract<PluginOutput["lines"][number], { type: "progress" }>

function isProgressLine(line: PluginOutput["lines"][number]): line is ProgressLine {
  return line.type === "progress"
}

function getRetainedData(pluginState: PluginState | undefined): PluginOutput | null {
  return pluginState?.data ?? pluginState?.lastSettledData ?? null
}

function getPrimaryLabels(meta: PluginMeta): string[] {
  if (meta.primaryCandidates?.length) return meta.primaryCandidates
  const legacyLabel = (meta as PluginMeta & { primaryProgressLabel?: string }).primaryProgressLabel
  return legacyLabel ? [legacyLabel] : []
}

function getPrimaryLine(
  meta: PluginMeta,
  data: PluginOutput | null
): { label: string; line: ProgressLine | null; candidateExists: boolean } {
  const candidateLabels = getPrimaryLabels(meta)
  for (const label of candidateLabels) {
    const line = data?.lines.find(
      (candidate): candidate is ProgressLine => isProgressLine(candidate) && candidate.label === label
    )
    if (line) return { label, line, candidateExists: true }
  }

  return {
    label: candidateLabels[0] ?? "",
    line: null,
    candidateExists: false,
  }
}

function getRemainingPercent(line: ProgressLine | null): number | null {
  if (!line || !Number.isFinite(line.used) || !Number.isFinite(line.limit) || line.limit <= 0) {
    return null
  }

  return Math.max(0, Math.min(100, ((line.limit - line.used) / line.limit) * 100))
}

function resolveProviderTrayCandidate(
  meta: PluginMeta,
  pluginState: PluginState | undefined
): TrayState {
  const data = getRetainedData(pluginState)
  const primary = getPrimaryLine(meta, data)
  const remainingPercentExact = getRemainingPercent(primary.line)

  if (pluginState?.error) {
    return {
      kind: "error",
      providerId: meta.id,
      providerName: meta.name,
      metricLabel: primary.label || null,
      errorMessage: pluginState.error,
      errorCategory: pluginState.errorCategory ?? null,
      lastKnownRemainingPercentExact: remainingPercentExact,
      lastKnownResetsAt: primary.line?.resetsAt ?? null,
    }
  }

  if (!data) {
    return {
      kind: "unknown",
      providerId: meta.id,
      providerName: meta.name,
      metricLabel: primary.label || null,
      reason: "no-data",
    }
  }

  if (getPrimaryLabels(meta).length === 0) {
    return {
      kind: "unknown",
      providerId: meta.id,
      providerName: meta.name,
      metricLabel: null,
      reason: "no-primary-metric",
    }
  }

  if (!primary.candidateExists) {
    return {
      kind: "unknown",
      providerId: meta.id,
      providerName: meta.name,
      metricLabel: primary.label || null,
      reason: "no-primary-metric",
    }
  }

  if (remainingPercentExact === null) {
    return {
      kind: "unknown",
      providerId: meta.id,
      providerName: meta.name,
      metricLabel: primary.label,
      reason: "invalid-limit",
    }
  }

  return {
    kind: "value",
    providerId: meta.id,
    providerName: meta.name,
    metricLabel: primary.label,
    remainingPercentExact,
    resetsAt: primary.line?.resetsAt ?? null,
  }
}

export function resolveTrayState(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  preferredProviderId?: string | null
}): TrayState {
  const { pluginsMeta, pluginSettings, pluginStates, preferredProviderId = null } = args
  if (!pluginSettings) {
    return {
      kind: "unknown",
      providerId: null,
      providerName: null,
      metricLabel: null,
      reason: "no-provider",
    }
  }

  const metaById = new Map(pluginsMeta.map((meta) => [meta.id, meta]))
  const disabled = new Set(pluginSettings.disabled)
  const candidates: TrayState[] = []

  for (const providerId of pluginSettings.order) {
    if (disabled.has(providerId)) continue
    const meta = metaById.get(providerId)
    if (!meta || meta.supportState === "comingSoonOnWindows") continue
    candidates.push(resolveProviderTrayCandidate(meta, pluginStates[providerId]))
  }

  if (candidates.length === 0) {
    return {
      kind: "unknown",
      providerId: null,
      providerName: null,
      metricLabel: null,
      reason: "no-provider",
    }
  }

  const preferred = preferredProviderId
    ? candidates.find((candidate) => candidate.providerId === preferredProviderId)
    : undefined
  return preferred ?? candidates[0] ?? {
    kind: "unknown",
    providerId: null,
    providerName: null,
    metricLabel: null,
    reason: "no-provider",
  }
}
