import type { PluginMeta } from "@/lib/plugin-types"
import type { TrayPrimaryBar } from "@/lib/tray-primary-progress"

export function formatTrayPercentText(fraction: number | undefined): string {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return "--%"
  const clampedFraction = Math.max(0, Math.min(1, fraction))
  return `${Math.round(clampedFraction * 100)}%`
}

export function formatTrayTooltip(
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
