import { useId, useMemo, useState } from "react"
import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PluginOutput } from "@/lib/plugin-types"
import {
  filterUsageHistory,
  summarizeUsageHistory,
  type UsageHistoryPeriod,
  type UsageHistoryRecord,
} from "@/lib/usage-history"
import { cn } from "@/lib/utils"

type ReportMetric = "cost" | "tokens" | "requests"

type UsageReportProps = {
  outputs: PluginOutput[]
  showProviderFilter?: boolean
  nowMs?: number
}

const PERIOD_OPTIONS: { value: UsageHistoryPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
]

const METRIC_OPTIONS: { value: ReportMetric; label: string }[] = [
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
]

function entryTokens(record: UsageHistoryRecord): number {
  return (
    record.totalTokens ??
    (record.inputTokens ?? 0) +
      (record.outputTokens ?? 0) +
      (record.cacheReadTokens ?? 0) +
      (record.cacheCreationTokens ?? 0) +
      (record.reasoningTokens ?? 0)
  )
}

function metricValue(record: UsageHistoryRecord, metric: ReportMetric): number {
  if (metric === "cost") return record.costUsd ?? 0
  if (metric === "requests") return record.requests ?? 0
  return entryTokens(record)
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value)
}

function formatMetric(value: number, metric: ReportMetric): string {
  if (metric === "cost") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return formatCompact(value)
}

function dailySeries(records: UsageHistoryRecord[], metric: ReportMetric) {
  const totals = new Map<string, number>()
  for (const record of records) {
    const day = record.periodStart.slice(0, 10)
    totals.set(day, (totals.get(day) ?? 0) + metricValue(record, metric))
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, value]) => ({ day, value }))
}

function TrendChart({ records, metric }: { records: UsageHistoryRecord[]; metric: ReportMetric }) {
  const titleId = useId()
  const descriptionId = useId()
  const points = dailySeries(records, metric)
  const max = Math.max(...points.map((point) => point.value), 0)
  const width = 320
  const height = 86
  const baseline = height - 16
  const plotHeight = 58
  const step = points.length > 1 ? width / (points.length - 1) : width / 2
  const coordinates = points.map((point, index) => {
    const x = points.length > 1 ? index * step : width / 2
    const y = max > 0 ? baseline - (point.value / max) * plotHeight : baseline
    return { ...point, x, y }
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[86px] w-full overflow-visible"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>{METRIC_OPTIONS.find((option) => option.value === metric)?.label} trend</title>
      <desc id={descriptionId}>
        {points.length === 0
          ? "No activity in this period."
          : points.map((point) => `${point.day}: ${formatMetric(point.value, metric)}`).join(", ")}
      </desc>
      <line x1="0" x2={width} y1={baseline} y2={baseline} className="stroke-border" />
      {coordinates.length > 1 ? (
        <polyline
          points={coordinates.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="text-primary dark:text-page-accent"
        />
      ) : null}
      {coordinates.map((point) => (
        <circle
          key={point.day}
          cx={point.x}
          cy={point.y}
          r="3"
          className="fill-primary dark:fill-page-accent"
        />
      ))}
    </svg>
  )
}

function SelectFilter({
  label,
  value,
  values,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">All {label.toLowerCase()}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

export function UsageReport({ outputs, showProviderFilter = false, nowMs }: UsageReportProps) {
  const [period, setPeriod] = useState<UsageHistoryPeriod>("30d")
  const [metric, setMetric] = useState<ReportMetric>("cost")
  const [providerId, setProviderId] = useState("")
  const [model, setModel] = useState("")
  const [project, setProject] = useState("")

  const available = useMemo(() => {
    const records = filterUsageHistory(outputs, {
      period: "30d",
      nowMs,
    })
    return {
      providerIds: [...new Set(records.map((record) => record.providerId))].sort(),
      models: [...new Set(records.map((record) => record.model).filter(Boolean) as string[])].sort(),
      projects: [...new Set(records.map((record) => record.project).filter(Boolean) as string[])].sort(),
    }
  }, [nowMs, outputs])

  const query = {
    period,
    nowMs,
    providerIds: providerId ? [providerId] : undefined,
    models: model ? [model] : undefined,
    projects: project ? [project] : undefined,
  }
  const records = filterUsageHistory(outputs, query)
  const summary = summarizeUsageHistory(outputs, query)
  const selectedValue =
    metric === "cost"
      ? summary.totals.costUsd
      : metric === "requests"
        ? summary.totals.requests
        : summary.totals.totalTokens
  const sources = [...new Set(records.map((record) => record.source))]

  if (!outputs.some((output) => output.history?.entries.length)) {
    return (
      <section className="border-t border-border/70 pt-3" aria-label="Usage history">
        <div className="flex items-start gap-2">
          <BarChart3 className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Usage history</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This provider does not expose local activity history yet. Current quota and reset data remains available above.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="border-t border-border/70 pt-3" aria-label="Usage history">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Usage history</h3>
          <p className="text-xs text-muted-foreground">Cached local activity, grouped by calendar day.</p>
        </div>
        <div className="text-right tabular-nums">
          <strong className="block text-base">{formatMetric(selectedValue, metric)}</strong>
          <span className="text-[11px] text-muted-foreground">{period === "30d" ? "last 30 days" : PERIOD_OPTIONS.find((option) => option.value === period)?.label.toLowerCase()}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="History period">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="xs"
            variant={period === option.value ? "default" : "outline"}
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="History metric">
        {METRIC_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={metric === option.value}
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors",
              metric === option.value
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
            onClick={() => setMetric(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {showProviderFilter || available.models.length > 1 || available.projects.length > 1 ? (
        <div className="mt-2 flex gap-2">
          {showProviderFilter && available.providerIds.length > 1 ? (
            <SelectFilter label="Providers" value={providerId} values={available.providerIds} onChange={setProviderId} />
          ) : null}
          {available.models.length > 1 ? (
            <SelectFilter label="Models" value={model} values={available.models} onChange={setModel} />
          ) : null}
          {available.projects.length > 1 ? (
            <SelectFilter label="Projects" value={project} values={available.projects} onChange={setProject} />
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 rounded-lg bg-muted/55 px-2 py-1.5">
        <TrendChart records={records} metric={metric} />
      </div>

      {records.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No matching activity in this period.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 divide-x divide-border text-center text-xs">
          <div className="px-1">
            <strong className="block tabular-nums">{formatMetric(summary.totals.costUsd, "cost")}</strong>
            <span className="text-muted-foreground">Cost</span>
          </div>
          <div className="px-1">
            <strong className="block tabular-nums">{formatCompact(summary.totals.totalTokens)}</strong>
            <span className="text-muted-foreground">Tokens</span>
          </div>
          <div className="px-1">
            <strong className="block tabular-nums">{formatCompact(summary.totals.requests)}</strong>
            <span className="text-muted-foreground">Requests</span>
          </div>
        </div>
      )}

      {summary.topModel ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Top model: <span className="font-medium text-foreground">{summary.topModel.model}</span>
          {summary.topModel.totalTokens > 0 ? `, ${formatCompact(summary.topModel.totalTokens)} tokens` : ""}
        </p>
      ) : null}
      {sources.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Source: {sources.join(", ")}. Cached on this device.</p>
      ) : null}
    </section>
  )
}
