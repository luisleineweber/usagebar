import { useMemo } from "react"
import type { ProviderUsageHistory, UsageHistoryPoint } from "@/lib/plugin-types"
import { clamp01, formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"

type UsageHistoryChartProps = {
  history?: ProviderUsageHistory
  lines: UsageHistoryPoint[]
  compact?: boolean
}

const MAX_VISIBLE_POINTS = 24

function formatValue(point: Pick<UsageHistoryPoint, "used" | "format">): string {
  if (point.format.kind === "percent") return `${Math.round(point.used)}%`
  if (point.format.kind === "dollars") return `$${formatFixedPrecisionNumber(point.used)}`
  return `${formatCountNumber(point.used)} ${point.format.suffix}`
}

function formatCapturedAt(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function chartSeries(
  history: ProviderUsageHistory | undefined,
  line: UsageHistoryPoint
): UsageHistoryPoint[] {
  return (history?.points ?? [])
    .filter((point) => point.label === line.label)
    .slice(-MAX_VISIBLE_POINTS)
}

export function UsageHistoryChart({ history, lines, compact = false }: UsageHistoryChartProps) {
  const charts = useMemo(() => {
    const uniqueLines = new Map(lines.map((line) => [line.label, line]))
    return [...uniqueLines.values()]
      .map((line) => ({ line, series: chartSeries(history, line) }))
      .filter(({ series }) => {
        if (series.length < 2) return false
        const first = series[0]
        return series.some((point) => point.used !== first.used || point.limit !== first.limit)
      })
      .slice(0, compact ? 2 : 4)
  }, [compact, history, lines])

  if (charts.length === 0) return null

  return (
    <section className="mt-4 space-y-2.5" aria-label="Usage history">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Usage trend</h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {Math.max(...charts.map(({ series }) => series.length))} samples
        </span>
      </div>
      <div className="space-y-2.5">
        {charts.map(({ line, series }) => {
          const values = series.map((point) => point.used)
          const min = Math.min(...values)
          const max = Math.max(...values)
          const range = Math.max(max - min, 1)
          const latest = series[series.length - 1] ?? line
          const path = series
            .map((point, index) => {
              const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100
              const y = 28 - clamp01((point.used - min) / range) * 24
              return `${x.toFixed(2)},${y.toFixed(2)}`
            })
            .join(" ")
          return (
            <div key={line.label} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-foreground">{line.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {formatValue(series[0])} {"->"} {formatValue(latest)}
                </span>
              </div>
              <div
                className="h-8 rounded-md border border-border/60 bg-muted/15 px-2 py-1"
                title={`${formatCapturedAt(series[0].capturedAt)}: ${formatValue(series[0])} -> ${formatCapturedAt(latest.capturedAt)}: ${formatValue(latest)}`}
              >
                <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                  <polyline
                    points={path}
                    fill="none"
                    stroke={line.color ?? "currentColor"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    className="text-primary"
                  />
                </svg>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
