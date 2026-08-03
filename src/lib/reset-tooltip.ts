import type { ResetTimerDisplayMode, TimeFormatMode } from "@/lib/settings"
import { formatCompactDuration } from "@/lib/pace-tooltip"

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>()

export function getTimeFormatter(mode: TimeFormatMode, timeZone?: string): Intl.DateTimeFormat {
  const cacheKey = `${mode}:${timeZone ?? "local"}`
  const cached = timeFormatterCache.get(cacheKey)
  if (cached) return cached
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
  if (mode === "12h") opts.hour12 = true
  else if (mode === "24h") opts.hour12 = false
  if (timeZone) opts.timeZone = timeZone
  const formatter = new Intl.DateTimeFormat(undefined, opts)
  timeFormatterCache.set(cacheKey, formatter)
  return formatter
}

const monthDayFormatterCache = new Map<string, Intl.DateTimeFormat>()

const RESET_SOON_THRESHOLD_MS = 5 * 60 * 1000

function parseResetTimestamp(resetsAtIso: string): number | null {
  const resetsAtMs = Date.parse(resetsAtIso)
  return Number.isFinite(resetsAtMs) ? resetsAtMs : null
}

function getLocalDayIndex(timestampMs: number, timeZone?: string): number {
  if (!timeZone) {
    const date = new Date(timestampMs)
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestampMs)
  const values = new Map(parts.map(({ type, value }) => [type, value]))
  return Math.floor(
    Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day"))
    ) / 86_400_000
  )
}

function formatMonthDay(timestampMs: number, timeZone?: string): string {
  const cacheKey = timeZone ?? "local"
  let formatter = monthDayFormatterCache.get(cacheKey)
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
    if (timeZone) options.timeZone = timeZone
    formatter = new Intl.DateTimeFormat(undefined, options)
    monthDayFormatterCache.set(cacheKey, formatter)
  }
  return formatter.format(timestampMs)
}

export function formatResetRelativeLabel(nowMs: number, resetsAtIso: string): string | null {
  const resetsAtMs = parseResetTimestamp(resetsAtIso)
  if (resetsAtMs === null) return null
  const deltaMs = resetsAtMs - nowMs
  if (deltaMs < RESET_SOON_THRESHOLD_MS) return "Resets soon"
  const durationText = formatCompactDuration(deltaMs)
  return durationText ? `Resets in ${durationText}` : null
}

export function formatResetAbsoluteLabel(
  nowMs: number,
  resetsAtIso: string,
  timeFormatMode: TimeFormatMode = "auto",
  timeZone?: string
): string | null {
  const resetsAtMs = parseResetTimestamp(resetsAtIso)
  if (resetsAtMs === null) return null
  if (resetsAtMs - nowMs <= 0) return "Resets soon"
  const dayDiff = getLocalDayIndex(resetsAtMs, timeZone) - getLocalDayIndex(nowMs, timeZone)
  const timeText = getTimeFormatter(timeFormatMode, timeZone).format(resetsAtMs)
  if (dayDiff <= 0) return `Resets today at ${timeText}`
  if (dayDiff === 1) return `Resets tomorrow at ${timeText}`
  const dateText = formatMonthDay(resetsAtMs, timeZone)
  return `Resets ${dateText} at ${timeText}`
}

export function formatResetTooltipText({
  nowMs,
  resetsAtIso,
  visibleMode,
  timeFormatMode = "auto",
  timeZone,
}: {
  nowMs: number
  resetsAtIso: string
  visibleMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  timeZone?: string
}): string | null {
  return visibleMode === "absolute"
    ? formatResetRelativeLabel(nowMs, resetsAtIso)
    : formatResetAbsoluteLabel(nowMs, resetsAtIso, timeFormatMode, timeZone)
}
