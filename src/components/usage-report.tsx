import { useEffect, useId, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ReportPricingEditor, loadModelPriceOverrides } from "@/components/report-pricing-editor"
import type { PluginOutput } from "@/lib/plugin-types"
import {
  filterUsageHistory,
  entryTotalTokens,
  summarizeUsageHistory,
  type UsageHistoryPeriod,
  type UsageHistoryRecord,
} from "@/lib/usage-history"
import { cn } from "@/lib/utils"
import { reportEntryCost, type ModelPriceOverrides } from "@/lib/report-pricing"

type ReportMetric = "cost" | "tokens" | "requests"
type ReportGrouping = "day" | "project"

type UsageReportProps = {
  outputs: PluginOutput[]
  showProviderFilter?: boolean
  stale?: boolean
  nowMs?: number
}

const PERIOD_OPTIONS: { value: UsageHistoryPeriod; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
]

const METRIC_OPTIONS: { value: ReportMetric; label: string }[] = [
  { value: "cost", label: "Cost" },
  { value: "tokens", label: "Tokens" },
  { value: "requests", label: "Requests" },
]

function metricValue(
  record: UsageHistoryRecord,
  metric: ReportMetric,
  overrides: ModelPriceOverrides
): number | null {
  if (metric === "cost") return reportEntryCost(record, overrides)
  if (metric === "requests") return record.requests ?? null
  return entryTotalTokens(record)
}

function formatCompact(value: number | null): string {
  if (value === null) return "—"
  return new Intl.NumberFormat(undefined, {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
  }).format(value)
}

function formatMetric(value: number | null, metric: ReportMetric): string {
  if (value === null) return "—"
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

function sumKnown(values: readonly (number | null)[]): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null
  let total = 0
  for (const value of values) total += value ?? 0
  return total
}

function recordCalendarDay(record: UsageHistoryRecord): string {
  const timeZone =
    record.timeZone === "system-local"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      : record.timeZone
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(record.periodStart))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function dailySeries(
  records: UsageHistoryRecord[],
  metric: ReportMetric,
  overrides: ModelPriceOverrides
) {
  const recordsByDay = new Map<string, UsageHistoryRecord[]>()
  for (const record of records) {
    const day = recordCalendarDay(record)
    recordsByDay.set(day, [...(recordsByDay.get(day) ?? []), record])
  }
  return [...recordsByDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, dayRecords]) => ({
      day,
      value: sumKnown(dayRecords.map((record) => metricValue(record, metric, overrides))),
      tokens: sumKnown(dayRecords.map(entryTotalTokens)),
      cost: sumKnown(dayRecords.map((record) => reportEntryCost(record, overrides))),
    }))
}

function formatChartDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)))
}

function TrendChart({
  records,
  metric,
  overrides,
}: {
  records: UsageHistoryRecord[]
  metric: ReportMetric
  overrides: ModelPriceOverrides
}) {
  const titleId = useId()
  const descriptionId = useId()
  const [activeDay, setActiveDay] = useState<string | null>(null)
  const points = dailySeries(records, metric, overrides)
  if (points.length === 1) {
    return (
      <div
        className="flex min-h-[86px] items-center justify-between gap-3 px-2"
        aria-label="Daily activity"
      >
        <div>
          <p className="text-xs font-medium">Activity on {points[0].day}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A trend appears after activity on more than one day.
          </p>
        </div>
        <strong className="shrink-0 tabular-nums text-sm">
          {formatMetric(points[0].value, metric)}
        </strong>
      </div>
    )
  }
  const max = Math.max(...points.map((point) => point.value ?? 0), 0)
  const width = 320
  const height = 86
  const baseline = height - 16
  const plotHeight = 58
  const step = points.length > 1 ? width / (points.length - 1) : width / 2
  const coordinates = points.map((point, index) => {
    const x = points.length > 1 ? index * step : width / 2
    const y =
      point.value !== null && max > 0 ? baseline - (point.value / max) * plotHeight : baseline
    return { ...point, x, y }
  })

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[86px] w-full overflow-visible"
      role="group"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>
        {METRIC_OPTIONS.find((option) => option.value === metric)?.label} trend
      </title>
      <desc id={descriptionId}>
        {points.length === 0
          ? "No activity in this period."
          : points.map((point) => `${point.day}: ${formatMetric(point.value, metric)}`).join(", ")}
      </desc>
      <line x1="0" x2={width} y1={baseline} y2={baseline} className="stroke-border" />
      {coordinates.length > 1 && coordinates.every((point) => point.value !== null) ? (
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
        <g key={point.day} transform={`translate(${point.x} ${point.y})`}>
          <g
            data-history-point={point.day}
            role="button"
            tabIndex={0}
            aria-label={`${point.day}: ${formatCompact(point.tokens)} tokens, ${formatMetric(point.cost, "cost")}`}
            className={cn("history-chart-point", activeDay === point.day && "is-active")}
            onMouseEnter={() => setActiveDay(point.day)}
            onMouseLeave={() => setActiveDay(null)}
            onFocus={() => setActiveDay(point.day)}
            onBlur={() => setActiveDay(null)}
          >
            <circle r="7" className="history-chart-dot-halo fill-primary dark:fill-page-accent" />
            <circle r="3" className="history-chart-dot fill-primary dark:fill-page-accent" />
          </g>
        </g>
      ))}
      {activeDay
        ? (() => {
            const point = coordinates.find((candidate) => candidate.day === activeDay)
            if (!point) return null
            const tooltipWidth = 136
            const tooltipHeight = 48
            const tooltipX = Math.min(
              Math.max(point.x - tooltipWidth / 2, 4),
              width - tooltipWidth - 4
            )
            const tooltipY =
              point.y > tooltipHeight + 12
                ? point.y - tooltipHeight - 10
                : Math.min(point.y + 10, height - tooltipHeight - 4)
            return (
              <g
                data-history-tooltip
                data-testid="history-tooltip"
                className="history-chart-tooltip"
                pointerEvents="none"
                transform={`translate(${tooltipX} ${tooltipY})`}
              >
                <rect
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx="6"
                  className="fill-popover stroke-border"
                />
                <text x="10" y="16" className="fill-popover-foreground text-[10px] font-medium">
                  {formatChartDay(point.day)}
                </text>
                <text x="10" y="32" className="fill-muted-foreground text-[10px]">
                  {formatCompact(point.tokens)} tokens · {formatMetric(point.cost, "cost")}
                </text>
              </g>
            )
          })()
        : null}
    </svg>
  )
}

function ProjectBreakdown({
  records,
  metric,
  overrides,
}: {
  records: UsageHistoryRecord[]
  metric: ReportMetric
  overrides: ModelPriceOverrides
}) {
  const values = new Map<string, (number | null)[]>()
  for (const record of records) {
    const project = record.project?.trim() || "Unspecified project"
    values.set(project, [...(values.get(project) ?? []), metricValue(record, metric, overrides)])
  }
  const rows = [...values.entries()]
    .map(([project, projectValues]) => [project, sumKnown(projectValues)] as const)
    .sort((left, right) => {
      if (left[1] === null) return right[1] === null ? 0 : 1
      if (right[1] === null) return -1
      return right[1] - left[1]
    })
  const max = Math.max(...rows.map(([, value]) => value ?? 0), 0)
  return (
    <div className="space-y-2 py-1" aria-label="Usage grouped by project">
      {rows.map(([project, value]) => (
        <div key={project}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{project}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatMetric(value, metric)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/70">
            <div
              className="h-full rounded-full bg-primary dark:bg-page-accent"
              style={{
                width: `${value !== null && max > 0 ? Math.max((value / max) * 100, 2) : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
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

export function UsageReport({
  outputs,
  showProviderFilter = false,
  stale = false,
  nowMs,
}: UsageReportProps) {
  const [period, setPeriod] = useState<UsageHistoryPeriod>("30d")
  const [metric, setMetric] = useState<ReportMetric>("cost")
  const [providerId, setProviderId] = useState("")
  const [model, setModel] = useState("")
  const [project, setProject] = useState("")
  const [groupBy, setGroupBy] = useState<ReportGrouping>("day")
  const [priceOverrides, setPriceOverrides] = useState<ModelPriceOverrides>({})

  useEffect(() => {
    void loadModelPriceOverrides().then(setPriceOverrides)
  }, [])

  const available = useMemo(() => {
    const records = filterUsageHistory(outputs, {
      period: "30d",
      nowMs,
    })
    return {
      providerIds: [...new Set(records.map((record) => record.providerId))].sort(),
      models: [
        ...new Set(records.map((record) => record.model).filter(Boolean) as string[]),
      ].sort(),
      projects: [
        ...new Set(records.map((record) => record.project).filter(Boolean) as string[]),
      ].sort(),
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
  const hasRequestData = summary.totals.requests !== null

  useEffect(() => {
    if (metric === "requests" && !hasRequestData) setMetric("cost")
  }, [hasRequestData, metric])
  const selectedValue =
    metric === "cost"
      ? sumKnown(records.map((record) => reportEntryCost(record, priceOverrides)))
      : metric === "requests"
        ? summary.totals.requests
        : summary.totals.totalTokens
  const sources = [...new Set(records.map((record) => record.source))]

  if (!outputs.some((output) => output.history?.entries.length)) return null

  return (
    <section className="border-t border-border/70 pt-3" aria-label="Usage history">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Usage history
            {stale ? <span className="ml-2 text-xs text-muted-foreground">Stale</span> : null}
          </h3>
          <p className="text-xs text-muted-foreground">
            Cached local activity, grouped by calendar day.
          </p>
        </div>
        <div className="text-right tabular-nums">
          <strong className="block text-base">{formatMetric(selectedValue, metric)}</strong>
          <span className="text-[11px] text-muted-foreground">
            {period === "30d"
              ? "last 30 days"
              : PERIOD_OPTIONS.find((option) => option.value === period)?.label.toLowerCase()}
          </span>
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
        {METRIC_OPTIONS.filter((option) => option.value !== "requests" || hasRequestData).map(
          (option) => (
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
          )
        )}
      </div>

      {available.projects.length > 0 ? (
        <div className="mt-2 flex gap-1" role="group" aria-label="History grouping">
          {(["day", "project"] as const).map((grouping) => (
            <button
              key={grouping}
              type="button"
              aria-pressed={groupBy === grouping}
              className={cn(
                "rounded-md px-2 py-1 text-xs capitalize transition-colors",
                groupBy === grouping
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              onClick={() => setGroupBy(grouping)}
            >
              {grouping === "day" ? "By day" : "By project"}
            </button>
          ))}
        </div>
      ) : null}

      {showProviderFilter || available.models.length > 1 || available.projects.length > 1 ? (
        <div className="mt-2 flex gap-2">
          {showProviderFilter && available.providerIds.length > 1 ? (
            <SelectFilter
              label="Providers"
              value={providerId}
              values={available.providerIds}
              onChange={setProviderId}
            />
          ) : null}
          {available.models.length > 1 ? (
            <SelectFilter
              label="Models"
              value={model}
              values={available.models}
              onChange={setModel}
            />
          ) : null}
          {available.projects.length > 1 ? (
            <SelectFilter
              label="Projects"
              value={project}
              values={available.projects}
              onChange={setProject}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 rounded-lg bg-muted/55 px-2 py-1.5">
        {groupBy === "project" ? (
          <ProjectBreakdown records={records} metric={metric} overrides={priceOverrides} />
        ) : (
          <TrendChart records={records} metric={metric} overrides={priceOverrides} />
        )}
      </div>

      <ReportPricingEditor
        models={available.models}
        overrides={priceOverrides}
        onChange={setPriceOverrides}
      />

      {records.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No matching activity in this period.</p>
      ) : (
        <div className="mt-2 grid grid-cols-3 divide-x divide-border text-center text-xs">
          <div className="px-1">
            <strong className="block tabular-nums">
              {formatMetric(
                sumKnown(records.map((record) => reportEntryCost(record, priceOverrides))),
                "cost"
              )}
            </strong>
            <span className="text-muted-foreground">Cost</span>
          </div>
          <div className="px-1">
            <strong className="block tabular-nums">
              {formatCompact(summary.totals.totalTokens)}
            </strong>
            <span className="text-muted-foreground">Tokens</span>
          </div>
          <div className="px-1">
            <strong className="block tabular-nums">
              {hasRequestData ? formatCompact(summary.totals.requests) : "—"}
            </strong>
            <span className="text-muted-foreground">Requests</span>
          </div>
        </div>
      )}

      {summary.topModel ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Top model: <span className="font-medium text-foreground">{summary.topModel.model}</span>
          {summary.topModel.totalTokens !== null && summary.topModel.totalTokens > 0
            ? `, ${formatCompact(summary.topModel.totalTokens)} tokens`
            : ""}
        </p>
      ) : null}
      {sources.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Source: {sources.join(", ")}. Cached on this device.
        </p>
      ) : null}
    </section>
  )
}
