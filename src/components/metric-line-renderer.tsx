/**
 * Renders a single MetricLine (text / badge / progress) from a provider plugin output.
 *
 * Extracted from provider-card.tsx to keep that file under the 400-LOC budget.
 * PaceIndicator lives here too since it is only consumed by MetricLineRenderer.
 */

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MetricLine } from "@/lib/plugin-types"
import type { DisplayMode, ResetTimerDisplayMode, TimeFormatMode } from "@/lib/settings"
import { clamp01, formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"
import { calculateDeficit, calculatePaceStatus, type PaceStatus } from "@/lib/pace-status"
import {
  buildPaceDetailText,
  formatDeficitText,
  formatRunsOutText,
  getPaceStatusText,
} from "@/lib/pace-tooltip"
import {
  formatResetAbsoluteLabel,
  formatResetRelativeLabel,
  formatResetTooltipText,
} from "@/lib/reset-tooltip"

// ---------------------------------------------------------------------------
// Pace status → visual config
// ---------------------------------------------------------------------------

const PACE_VISUALS = {
  ahead: { dotClass: "bg-green-500" },
  "on-track": { dotClass: "bg-yellow-500" },
  behind: { dotClass: "bg-red-500" },
} satisfies Record<PaceStatus, { dotClass: string }>

const PACE_LABELS = {
  ahead: "Ahead",
  "on-track": "On track",
  behind: "At risk",
} satisfies Record<PaceStatus, string>

// ---------------------------------------------------------------------------
// PaceIndicator — colored dot with tooltip breakdown
// ---------------------------------------------------------------------------

export function PaceIndicator({
  status,
  detailText,
  isLimitReached,
}: {
  status: PaceStatus
  detailText?: string | null
  isLimitReached?: boolean
}) {
  const colorClass = PACE_VISUALS[status].dotClass
  const statusText = getPaceStatusText(status)
  const visibleStatusText = isLimitReached ? "Limit reached" : PACE_LABELS[status]

  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <span
            {...props}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            aria-label={isLimitReached ? "Limit reached" : statusText}
          >
            <span aria-hidden className={`inline-block size-2 rounded-full ${colorClass}`} />
            <span>{visibleStatusText}</span>
          </span>
        )}
      />
      <TooltipContent side="top" className="text-xs text-center">
        {isLimitReached ? (
          "Limit reached"
        ) : (
          <>
            <div>{statusText}</div>
            {detailText && <div className="text-[10px] opacity-60">{detailText}</div>}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// MetricLineRenderer — renders text, badge, or progress MetricLine variants
// ---------------------------------------------------------------------------

export function MetricLineRenderer({
  line,
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode = "auto",
  onResetTimerDisplayModeToggle,
  now,
  refreshing,
}: {
  line: MetricLine
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
  now: number
  refreshing?: boolean
}) {
  if (line.type === "text") {
    return (
      <div>
        <div className="flex justify-between items-center h-[18px]">
          <span className="text-xs text-muted-foreground flex-shrink-0">{line.label}</span>
          <span
            className="text-xs text-muted-foreground truncate min-w-0 max-w-[60%] text-right"
            style={line.color ? { color: line.color } : undefined}
            title={line.value}
          >
            {line.value}
          </span>
        </div>
        {line.subtitle && (
          <div className="text-[10px] text-muted-foreground text-right -mt-0.5">
            {line.subtitle}
          </div>
        )}
      </div>
    )
  }

  if (line.type === "badge") {
    return (
      <div>
        <div className="flex justify-between items-center h-[22px]">
          <span className="text-sm text-muted-foreground flex-shrink-0">{line.label}</span>
          <Badge
            variant="outline"
            className="truncate min-w-0 max-w-[60%]"
            style={line.color ? { color: line.color, borderColor: line.color } : undefined}
            title={line.text}
          >
            {line.text}
          </Badge>
        </div>
        {line.subtitle && (
          <div className="text-xs text-muted-foreground text-right -mt-0.5">{line.subtitle}</div>
        )}
      </div>
    )
  }

  if (line.type === "progress") {
    const isUnsupported = line.availability === "unsupported"
    const isUnavailable = line.availability !== undefined
    const used = line.used
    const limit = line.limit
    if (
      isUnavailable ||
      typeof used !== "number" ||
      !Number.isFinite(used) ||
      typeof limit !== "number" ||
      !Number.isFinite(limit) ||
      limit <= 0
    ) {
      const unavailableLabel = isUnsupported ? "Not available" : "—"
      return (
        <div>
          <div className="flex justify-between items-center h-[22px]">
            <span className="text-sm text-muted-foreground flex-shrink-0">{line.label}</span>
            <span
              className="text-xs text-muted-foreground"
              title={isUnsupported ? "Not available" : "Unknown"}
            >
              {unavailableLabel}
            </span>
          </div>
        </div>
      )
    }

    const resetsAtMs = line.resetsAt ? Date.parse(line.resetsAt) : Number.NaN
    const periodDurationMs = line.periodDurationMs
    const hasPaceContext = Number.isFinite(resetsAtMs) && Number.isFinite(periodDurationMs)
    const hasTimeMarkerContext = hasPaceContext && periodDurationMs! > 0

    const shownAmount = displayMode === "used" ? used : Math.max(0, limit - used)
    const percent = Math.round(clamp01(shownAmount / limit) * 10000) / 100
    const displaySuffix = displayMode === "left" ? " left" : " used"

    const primaryText =
      line.format.kind === "percent"
        ? `${Math.round(shownAmount)}%${displaySuffix}`
        : line.format.kind === "dollars"
          ? `$${formatFixedPrecisionNumber(shownAmount)}${displaySuffix}`
          : `${formatCountNumber(shownAmount)} ${line.format.suffix}${displaySuffix}`

    const resetLabel = line.resetsAt
      ? resetTimerDisplayMode === "absolute"
        ? formatResetAbsoluteLabel(now, line.resetsAt, timeFormatMode)
        : formatResetRelativeLabel(now, line.resetsAt)
      : null
    const resetTooltipText = line.resetsAt
      ? formatResetTooltipText({
          nowMs: now,
          resetsAtIso: line.resetsAt,
          visibleMode: resetTimerDisplayMode,
          timeFormatMode,
        })
      : null

    const secondaryText =
      resetLabel ??
      (line.format.kind === "percent"
        ? `${limit}% cap`
        : line.format.kind === "dollars"
          ? `$${formatFixedPrecisionNumber(limit)} limit`
          : `${formatCountNumber(limit)} ${line.format.suffix}`)

    const paceResult = hasPaceContext
      ? calculatePaceStatus(used, limit, resetsAtMs, periodDurationMs!, now)
      : null
    const paceStatus = paceResult?.status ?? null
    const paceMarkerValue =
      hasTimeMarkerContext && paceStatus && paceStatus !== "on-track"
        ? (() => {
            const periodStartMs = resetsAtMs - periodDurationMs!
            const elapsedFraction = clamp01((now - periodStartMs) / periodDurationMs!)
            const elapsedPercent = elapsedFraction * 100
            return displayMode === "used" ? elapsedPercent : 100 - elapsedPercent
          })()
        : undefined
    const isLimitReached = used >= limit
    const paceDetailText =
      hasPaceContext && !isLimitReached
        ? buildPaceDetailText({
            paceResult,
            used,
            limit,
            periodDurationMs: periodDurationMs!,
            resetsAtMs,
            nowMs: now,
            displayMode,
          })
        : null

    const deficit =
      hasPaceContext && !isLimitReached
        ? calculateDeficit(used, limit, resetsAtMs, periodDurationMs!, now)
        : null
    const deficitText =
      deficit !== null ? formatDeficitText(deficit, line.format, displayMode) : null
    const runsOutText =
      hasPaceContext && !isLimitReached
        ? formatRunsOutText({
            paceResult,
            used,
            limit,
            periodDurationMs: periodDurationMs!,
            resetsAtMs,
            nowMs: now,
          })
        : null

    return (
      <div>
        <div className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
          {line.label}
          {paceStatus && (
            <PaceIndicator
              status={paceStatus}
              detailText={paceDetailText}
              isLimitReached={isLimitReached}
            />
          )}
        </div>
        <Progress
          value={percent}
          indicatorColor={line.color}
          markerValue={paceMarkerValue}
          refreshing={refreshing}
        />
        <div className="flex justify-between items-center mt-1.5">
          <span className="text-xs text-muted-foreground tabular-nums">{primaryText}</span>
          {secondaryText &&
            (resetTooltipText ? (
              <Tooltip>
                <TooltipTrigger
                  render={(props) =>
                    resetLabel && onResetTimerDisplayModeToggle ? (
                      <button
                        {...props}
                        type="button"
                        onClick={onResetTimerDisplayModeToggle}
                        className="text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors"
                      >
                        {secondaryText}
                      </button>
                    ) : (
                      <span {...props} className="text-xs text-muted-foreground tabular-nums">
                        {secondaryText}
                      </span>
                    )
                  }
                />
                <TooltipContent side="top">{resetTooltipText}</TooltipContent>
              </Tooltip>
            ) : resetLabel && onResetTimerDisplayModeToggle ? (
              <button
                type="button"
                onClick={onResetTimerDisplayModeToggle}
                className="text-xs text-muted-foreground tabular-nums hover:text-foreground transition-colors"
              >
                {secondaryText}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{secondaryText}</span>
            ))}
        </div>
        {(deficitText || runsOutText) && (
          <div className="flex justify-between items-center mt-0.5">
            {deficitText && (
              <span className="text-xs text-muted-foreground tabular-nums">{deficitText}</span>
            )}
            {runsOutText && (
              <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                {runsOutText}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
