import type {
  PluginOutput,
  ProviderInstanceRef,
  UsageHistoryEntry,
  UsageHistoryEntryScope,
} from "@/lib/plugin-types"

/**
 * Rolling periods (`7d`, `30d`) include today and the days before it.
 * Calendar-to-date periods start at local midnight on the first day of the current
 * ISO 8601 week (Monday) or the current month, and end now.
 */
export type UsageHistoryPeriod = "today" | "yesterday" | "7d" | "30d" | "weekToDate" | "monthToDate"

export type UsageHistoryFilters = {
  providerIds?: readonly string[]
  models?: readonly string[]
  projects?: readonly string[]
}

export type UsageHistoryQuery = UsageHistoryFilters & {
  period: UsageHistoryPeriod
  nowMs?: number
  /** IANA time zone used to resolve calendar windows, including DST. */
  timeZone?: string
}

export type UsageHistoryRecord = UsageHistoryEntry & {
  providerId: string
  instanceRef?: ProviderInstanceRef
  source: string
  timeZone: string
}

export type UsageHistoryTotals = {
  costUsd: number | null
  requests: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheCreationTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
}

export type UsageHistoryTopModel = {
  model: string
  costUsd: number | null
  requests: number | null
  totalTokens: number | null
}

export type UsageHistorySummary = {
  period: UsageHistoryPeriod
  entryCount: number
  totals: UsageHistoryTotals
  topModel: UsageHistoryTopModel | null
}

const PERIODS: readonly UsageHistoryPeriod[] = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "weekToDate",
  "monthToDate",
]

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function entryTotalTokens(entry: UsageHistoryEntry): number | null {
  if (typeof entry.totalTokens === "number" && Number.isFinite(entry.totalTokens)) {
    return entry.totalTokens
  }
  const requiredTokenValues = [
    entry.inputTokens,
    entry.outputTokens,
    entry.cacheReadTokens,
    entry.cacheCreationTokens,
  ].map(finiteOrNull)
  if (requiredTokenValues.some((value) => value === null)) return null

  // ccusage does not report reasoning tokens for every provider. Keep them optional,
  // but keep the input, output, and cache fields authoritative for the derived total.
  const reasoningTokens = finiteOrNull(entry.reasoningTokens)
  return (
    requiredTokenValues.reduce<number>((total, value) => total + (value ?? 0), 0) +
    (reasoningTokens ?? 0)
  )
}

/** False when the row's scope says it does not report metrics of this kind. */
export function entryReports(entry: UsageHistoryEntry, kind: UsageHistoryEntryScope): boolean {
  return entry.scope === undefined || entry.scope === kind
}

function selected(value: string | undefined, allowed: ReadonlySet<string> | null): boolean {
  if (!allowed) return true
  return value !== undefined && allowed.has(value)
}

function selection(values: readonly string[] | undefined): ReadonlySet<string> | null {
  return values && values.length > 0 ? new Set(values) : null
}

export function getUsageHistoryWindow(
  period: UsageHistoryPeriod,
  nowMs = Date.now(),
  timeZone = "UTC"
): { startMs: number; endMs: number } {
  const today = datePartsInTimeZone(nowMs, timeZone)
  const todayStartMs = zonedMidnightMs(today.year, today.month, today.day, timeZone)

  if (period === "yesterday") {
    const previous = shiftCalendarDate(today, -1)
    return {
      startMs: zonedMidnightMs(previous.year, previous.month, previous.day, timeZone),
      endMs: todayStartMs,
    }
  }

  const first =
    period === "weekToDate"
      ? shiftCalendarDate(today, -isoWeekdayIndex(today))
      : period === "monthToDate"
        ? { ...today, day: 1 }
        : shiftCalendarDate(today, -(ROLLING_DAYS[period] - 1))
  return {
    startMs: zonedMidnightMs(first.year, first.month, first.day, timeZone),
    endMs: nowMs,
  }
}

type CalendarDate = { year: number; month: number; day: number }

const ROLLING_DAYS = { today: 1, "7d": 7, "30d": 30 } as const

/** Days since the ISO 8601 week start: Monday = 0, Sunday = 6. */
function isoWeekdayIndex(date: CalendarDate): number {
  return (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7
}

function zonedFormatter(timeZone: string, withTime = false): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }
  if (withTime) {
    Object.assign(options, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23" as const,
    })
  }
  return new Intl.DateTimeFormat("en-US", options)
}

function numericParts(formatter: Intl.DateTimeFormat, date: Date): Record<string, number> {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  )
}

function datePartsInTimeZone(timestampMs: number, timeZone: string): CalendarDate {
  const parts = numericParts(zonedFormatter(timeZone), new Date(timestampMs))
  return { year: parts.year, month: parts.month, day: parts.day }
}

function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function zonedMidnightMs(year: number, month: number, day: number, timeZone: string): number {
  const desiredWallClockMs = Date.UTC(year, month - 1, day)
  let candidateMs = desiredWallClockMs
  const formatter = zonedFormatter(timeZone, true)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = numericParts(formatter, new Date(candidateMs))
    const representedWallClockMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
    const correctionMs = desiredWallClockMs - representedWallClockMs
    candidateMs += correctionMs
    if (correctionMs === 0) break
  }

  return candidateMs
}

export function hasUsageHistory(outputs: readonly Pick<PluginOutput, "history">[]): boolean {
  return outputs.some((output) => Boolean(output.history?.entries.length))
}

export function filterUsageHistory(
  outputs: readonly Pick<PluginOutput, "providerId" | "history" | "instanceRef">[],
  query: UsageHistoryQuery
): UsageHistoryRecord[] {
  const providerIds = selection(query.providerIds)
  const models = selection(query.models)
  const projects = selection(query.projects)
  const records: UsageHistoryRecord[] = []

  for (const output of outputs) {
    if (!selected(output.providerId, providerIds) || output.history?.version !== 1) continue
    const sourceTimeZone =
      query.timeZone ??
      (output.history.timeZone === "system-local"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
        : output.history.timeZone)
    const { startMs, endMs } = getUsageHistoryWindow(query.period, query.nowMs, sourceTimeZone)

    for (const entry of output.history.entries) {
      const periodStartMs = Date.parse(entry.periodStart)
      const periodEndMs = Date.parse(entry.periodEnd)
      if (
        !Number.isFinite(periodStartMs) ||
        !Number.isFinite(periodEndMs) ||
        periodStartMs >= periodEndMs
      ) {
        throw new Error("Invalid usage history period")
      }
      if (periodEndMs <= startMs || periodStartMs >= endMs) continue
      if (!selected(entry.model, models) || !selected(entry.project, projects)) continue

      records.push({
        ...entry,
        providerId: output.providerId,
        instanceRef: output.instanceRef,
        source: output.history.source,
        timeZone: output.history.timeZone,
      })
    }
  }

  return records
}

/**
 * Sums a metric over the rows that report it. Null when no row reports it, or when a
 * reporting row omits the value.
 */
function sumMetric(
  entries: readonly UsageHistoryEntry[],
  kind: UsageHistoryEntryScope,
  getValue: (entry: UsageHistoryEntry) => number | undefined | null
): number | null {
  const reporting = entries.filter((entry) => entryReports(entry, kind))
  if (reporting.length === 0) return null
  let total = 0
  for (const entry of reporting) {
    const value = finiteOrNull(getValue(entry) ?? undefined)
    if (value === null) return null
    total += value
  }
  return total
}

function getTopModel(records: readonly UsageHistoryRecord[]): UsageHistoryTopModel | null {
  const byModel = new Map<string, UsageHistoryRecord[]>()

  for (const record of records) {
    const model = record.model?.trim()
    if (!model) continue
    byModel.set(model, [...(byModel.get(model) ?? []), record])
  }

  return (
    [...byModel.entries()]
      .map(([model, modelRecords]) => ({
        model,
        costUsd: sumMetric(modelRecords, "cost", (record) => record.costUsd),
        requests: sumMetric(modelRecords, "usage", (record) => record.requests),
        totalTokens: sumMetric(modelRecords, "usage", entryTotalTokens),
      }))
      .sort((a, b) => {
        const costOrder = compareKnownDescending(a.costUsd, b.costUsd)
        if (costOrder !== 0) return costOrder
        const tokenOrder = compareKnownDescending(a.totalTokens, b.totalTokens)
        if (tokenOrder !== 0) return tokenOrder
        const requestOrder = compareKnownDescending(a.requests, b.requests)
        return requestOrder || a.model.localeCompare(b.model)
      })[0] ?? null
  )
}

function compareKnownDescending(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return b - a
}

export function summarizeUsageHistory(
  outputs: readonly Pick<PluginOutput, "providerId" | "history">[],
  query: UsageHistoryQuery
): UsageHistorySummary {
  // Windows resolve per source time zone in filterUsageHistory, so one summary-wide
  // start and end would disagree with UTC sources.
  const records = filterUsageHistory(outputs, query)

  return {
    period: query.period,
    entryCount: records.length,
    totals: {
      costUsd: sumMetric(records, "cost", (record) => record.costUsd),
      requests: sumMetric(records, "usage", (record) => record.requests),
      inputTokens: sumMetric(records, "usage", (record) => record.inputTokens),
      outputTokens: sumMetric(records, "usage", (record) => record.outputTokens),
      cacheReadTokens: sumMetric(records, "usage", (record) => record.cacheReadTokens),
      cacheCreationTokens: sumMetric(records, "usage", (record) => record.cacheCreationTokens),
      reasoningTokens: sumMetric(records, "usage", (record) => record.reasoningTokens),
      totalTokens: sumMetric(records, "usage", entryTotalTokens),
    },
    topModel: getTopModel(records),
  }
}

export function summarizeUsageHistoryPeriods(
  outputs: readonly Pick<PluginOutput, "providerId" | "history">[],
  options: UsageHistoryFilters & { nowMs?: number; timeZone?: string } = {}
): Record<UsageHistoryPeriod, UsageHistorySummary> {
  return Object.fromEntries(
    PERIODS.map((period) => [period, summarizeUsageHistory(outputs, { ...options, period })])
  ) as Record<UsageHistoryPeriod, UsageHistorySummary>
}
