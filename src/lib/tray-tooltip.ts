import type { TimeFormatMode } from "@/lib/settings"
import type { PluginMeta } from "@/lib/plugin-types"
import { formatResetAbsoluteLabel } from "@/lib/reset-tooltip"
import type { TrayState } from "@/lib/tray-state"
import type { TrayPrimaryBar } from "@/lib/tray-primary-progress"

function formatExactPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–"
  return value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1")
}

export function formatTrayPercentText(fraction: number | undefined): string {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return "–"
  const clampedFraction = Math.max(0, Math.min(1, fraction))
  return `${Math.round(clampedFraction * 100)}%`
}

export function formatTrayBarsTooltip(
  bars: TrayPrimaryBar[],
  pluginsMeta: PluginMeta[],
  title = "UsageBar"
): string {
  if (!bars.length) return title
  const pluginNameById = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin.name]))
  const lines = [title]

  for (const bar of bars) {
    const pluginName = pluginNameById.get(bar.id)
    if (!pluginName) continue
    lines.push(`${pluginName}: ${formatTrayPercentText(bar.fraction)}`)
  }

  return lines.join("\n")
}

export function formatTrayNativeTitle(state: TrayState): string {
  if (state.kind === "error") return "!"
  if (state.kind === "unknown") return "–"
  return `${Math.round(Math.max(0, Math.min(100, state.remainingPercentExact)))}%`
}

export function formatTrayTooltip(
  state: TrayState,
  options: {
    title?: string
    nowMs?: number
    timeFormatMode?: TimeFormatMode
    timeZone?: string
  } = {}
): string {
  const title = options.title ?? "UsageBar"
  const nowMs = options.nowMs ?? Date.now()
  const timeFormatMode = options.timeFormatMode ?? "auto"
  const timeZone = options.timeZone
  const lines = [title]

  if (state.kind === "unknown") {
    if (state.providerName) {
      lines.push(`${state.providerName}${state.metricLabel ? ` — ${state.metricLabel}` : ""}`)
    }
    lines.push("Remaining: –", "Reset: Unknown")
    return lines.join("\n")
  }

  lines.push(`${state.providerName}${state.metricLabel ? ` — ${state.metricLabel}` : ""}`)

  if (state.kind === "error") {
    lines.push("Update failed")
    if (state.lastKnownRemainingPercentExact !== null) {
      lines.push(
        `Last known: ${formatExactPercent(state.lastKnownRemainingPercentExact)}% remaining`
      )
    }
    const resetText = state.lastKnownResetsAt
      ? formatResetAbsoluteLabel(nowMs, state.lastKnownResetsAt, timeFormatMode, timeZone)
      : null
    lines.push(`Last known reset: ${resetText ?? "Unknown"}`)
    return lines.join("\n")
  }

  lines.push(`Remaining: ${formatExactPercent(state.remainingPercentExact)}%`)
  const resetText = state.resetsAt
    ? formatResetAbsoluteLabel(nowMs, state.resetsAt, timeFormatMode, timeZone)
    : null
  lines.push(resetText ?? "Reset: Unknown")
  return lines.join("\n")
}
