import { Badge } from "@/components/ui/badge"
import { MetricLineRenderer } from "@/components/metric-line-renderer"
import { useNowTicker } from "@/hooks/use-now-ticker"
import type {
  ManifestDetail,
  ManifestDetailField,
  PluginDetailValue,
  ProgressFormat,
} from "@/lib/plugin-types"
import type { DisplayMode, ResetTimerDisplayMode, TimeFormatMode } from "@/lib/settings"

type ProviderDetailSchemaProps = {
  schema?: ManifestDetail
  values?: PluginDetailValue[]
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
}

function formatText(value: string, field: ManifestDetailField): string {
  const detailFormat = field.format
  const format = detailFormat?.kind
  if (!format || format === "text") return value
  if (format === "percent") return value + "%"
  if (format === "currency") {
    const number = Number(value)
    if (!Number.isFinite(number)) return value
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: detailFormat.currency,
    }).format(number)
  }
  if (format === "date" || format === "dateTime") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
    if (format === "dateTime") options.timeStyle = "short"
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
  if (format === "count") return value + " " + detailFormat.suffix
  return value
}

function formatChartValue(value: number, format?: ProgressFormat): string {
  if (!format) return String(value)
  if (format.kind === "percent") return Math.round(value) + "%"
  if (format.kind === "dollars") return "$" + value.toFixed(2)
  return value + " " + format.suffix
}

function Sparkline({
  field,
  value,
}: {
  field: ManifestDetailField
  value: Extract<PluginDetailValue, { type: "chart" }>
}) {
  const width = 220
  const height = 48
  const values = value.points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = value.points
    .map((point, index) => {
      const x = (index / Math.max(1, value.points.length - 1)) * width
      const y = height - ((point.value - min) / range) * (height - 8) - 4
      return x + "," + y
    })
    .join(" ")

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatChartValue(value.points[value.points.length - 1].value, value.format)}
        </span>
      </div>
      <svg
        role="img"
        aria-label={field.label}
        viewBox={"0 0 " + width + " " + height}
        className="h-12 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke={value.color ?? "currentColor"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

function DetailField({
  field,
  value,
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode,
  onResetTimerDisplayModeToggle,
  now,
}: {
  field: ManifestDetailField
  value: PluginDetailValue
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
  now: number
}) {
  if (field.type === "text" && value.type === "text") {
    return (
      <div className="flex min-h-[18px] items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-muted-foreground">{field.label}</span>
        <span
          className="min-w-0 max-w-[65%] truncate text-right text-xs text-muted-foreground"
          style={value.color ? { color: value.color } : undefined}
          title={value.value}
        >
          {formatText(value.value, field)}
        </span>
      </div>
    )
  }

  if (field.type === "badge" && value.type === "badge") {
    return (
      <div className="flex min-h-[22px] items-center justify-between gap-3">
        <span className="shrink-0 text-sm text-muted-foreground">{field.label}</span>
        <Badge
          variant="outline"
          className="max-w-[65%] truncate"
          style={value.color ? { color: value.color, borderColor: value.color } : undefined}
        >
          {value.text}
        </Badge>
      </div>
    )
  }

  if (field.type === "window" && value.type === "window") {
    return (
      <MetricLineRenderer
        line={{
          type: "progress",
          label: field.label,
          used: value.used,
          limit: value.limit,
          format: value.format,
          availability: value.availability,
          resetsAt: value.resetsAt,
          periodDurationMs: value.periodDurationMs,
          color: value.color,
        }}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        timeFormatMode={timeFormatMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
        now={now}
      />
    )
  }

  if (field.type === "chart" && value.type === "chart") {
    return <Sparkline field={field} value={value} />
  }

  if (field.type === "notice" && value.type === "notice") {
    const toneClass =
      value.tone === "error"
        ? "border-destructive/30 bg-destructive/5 text-destructive"
        : value.tone === "warning"
          ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300"
          : "border-border/70 bg-muted/40 text-muted-foreground"
    return <div className={"rounded-md border px-2 py-1.5 text-xs " + toneClass}>{value.text}</div>
  }

  return null
}

export function ProviderDetailSchema({
  schema,
  values = [],
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode,
  onResetTimerDisplayModeToggle,
}: ProviderDetailSchemaProps) {
  const now = useNowTicker({ enabled: values.some((value) => value.type === "window") })
  const valuesById = new Map(values.map((value) => [value.id, value]))
  if (!schema) return null

  const sections = schema.sections
    .map((section) => ({
      section,
      fields: section.fields.filter((field) => valuesById.has(field.id)),
    }))
    .filter(({ fields }) => fields.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="space-y-3">
      {sections.map(({ section, fields }) => (
        <section key={section.id} className="space-y-2">
          <h3 className="text-sm font-medium">{section.label}</h3>
          <div className="space-y-3">
            {fields.map((field) => (
              <DetailField
                key={field.id}
                field={field}
                value={valuesById.get(field.id)!}
                displayMode={displayMode}
                resetTimerDisplayMode={resetTimerDisplayMode}
                timeFormatMode={timeFormatMode}
                onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
                now={now}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
