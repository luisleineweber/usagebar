import type { PluginOutput, ProviderInstanceRef, UsageHistoryEntry } from "@/lib/plugin-types"

export type UsageHistoryPeriod = "today" | "yesterday" | "7d" | "30d"

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
  costUsd: number
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  reasoningTokens: number
  totalTokens: number
}

export type UsageHistoryTopModel = {
  model: string
  costUsd: number
  requests: number
  totalTokens: number
}

export type UsageHistorySummary = {
  period: UsageHistoryPeriod
  startMs: number
  endMs: number
  entryCount: number
  totals: UsageHistoryTotals
  topModel: UsageHistoryTopModel | null
}

const PERIODS: readonly UsageHistoryPeriod[] = ["today", "yesterday", "7d", "30d"]

const EMPTY_TOTALS: UsageHistoryTotals = {
  costUsd: 0,
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function entryTotalTokens(entry: UsageHistoryEntry): number {
  if (typeof entry.totalTokens === "number" && Number.isFinite(entry.totalTokens)) {
    return entry.totalTokens
  }
  return (
    finiteOrZero(entry.inputTokens) +
    finiteOrZero(entry.outputTokens) +
    finiteOrZero(entry.cacheReadTokens) +
    finiteOrZero(entry.cacheCreationTokens) +
    finiteOrZero(entry.reasoningTokens)
  )
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

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 1
  const first = shiftCalendarDate(today, -(days - 1))
  return {
    startMs: zonedMidnightMs(first.year, first.month, first.day, timeZone),
    endMs: nowMs,
  }
}

type CalendarDate = { year: number; month: number; day: number }

function zonedFormatter(timeZone: string, withTime = false): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23" as const,
        }
      : {}),
  })
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
        ...(output.instanceRef ? { instanceRef: output.instanceRef } : {}),
        source: output.history.source,
        timeZone: output.history.timeZone,
      })
    }
  }

  return records
}

function addEntry(totals: UsageHistoryTotals, entry: UsageHistoryEntry): void {
  totals.costUsd += finiteOrZero(entry.costUsd)
  totals.requests += finiteOrZero(entry.requests)
  totals.inputTokens += finiteOrZero(entry.inputTokens)
  totals.outputTokens += finiteOrZero(entry.outputTokens)
  totals.cacheReadTokens += finiteOrZero(entry.cacheReadTokens)
  totals.cacheCreationTokens += finiteOrZero(entry.cacheCreationTokens)
  totals.reasoningTokens += finiteOrZero(entry.reasoningTokens)
  totals.totalTokens += entryTotalTokens(entry)
}

function getTopModel(records: readonly UsageHistoryRecord[]): UsageHistoryTopModel | null {
  const byModel = new Map<string, UsageHistoryTopModel>()

  for (const record of records) {
    const model = record.model?.trim()
    if (!model) continue
    const current = byModel.get(model) ?? { model, costUsd: 0, requests: 0, totalTokens: 0 }
    current.costUsd += finiteOrZero(record.costUsd)
    current.requests += finiteOrZero(record.requests)
    current.totalTokens += entryTotalTokens(record)
    byModel.set(model, current)
  }

  return (
    [...byModel.values()].sort(
      (a, b) =>
        b.costUsd - a.costUsd ||
        b.totalTokens - a.totalTokens ||
        b.requests - a.requests ||
        a.model.localeCompare(b.model)
    )[0] ?? null
  )
}

export function summarizeUsageHistory(
  outputs: readonly Pick<PluginOutput, "providerId" | "history">[],
  query: UsageHistoryQuery
): UsageHistorySummary {
  const records = filterUsageHistory(outputs, query)
  const totals = { ...EMPTY_TOTALS }
  for (const record of records) addEntry(totals, record)
  const { startMs, endMs } = getUsageHistoryWindow(
    query.period,
    query.nowMs,
    query.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
  )

  return {
    period: query.period,
    startMs,
    endMs,
    entryCount: records.length,
    totals,
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
