/**
 * ProviderCard — card that shows usage metrics for a single provider.
 *
 * Rendering of individual MetricLine variants (text/badge/progress) and the
 * PaceIndicator dot live in metric-line-renderer.tsx to keep this file focused.
 */

import { Fragment, useMemo } from "react";
import { AlertCircle, ExternalLink, Hourglass, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SkeletonLines } from "@/components/skeleton-lines";
import { PluginError } from "@/components/plugin-error";
import { MetricLineRenderer } from "@/components/metric-line-renderer";
import { useNowTicker } from "@/hooks/use-now-ticker";
import {
  REFRESH_COOLDOWN_MS,
  type DisplayMode,
  type ResetTimerDisplayMode,
} from "@/lib/settings";
import type { ManifestLine, MetricLine, PluginLink } from "@/lib/plugin-types";
import { groupLinesByType } from "@/lib/group-lines-by-type";
import {
  hasProviderStatusIssue,
  providerStatusLabel,
  type ProviderStatus,
} from "@/lib/provider-status";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  name: string;
  plan?: string;
  links?: PluginLink[];
  showSeparator?: boolean;
  loading?: boolean;
  error?: string | null;
  lines?: MetricLine[];
  skeletonLines?: ManifestLine[];
  lastManualRefreshAt?: number | null;
  /** Epoch ms of the last successful data fetch. Shown in error states and tooltips. */
  lastUpdatedAt?: number | null;
  onRetry?: () => void;
  scopeFilter?: "overview" | "all";
  displayMode: DisplayMode;
  resetTimerDisplayMode?: ResetTimerDisplayMode;
  onResetTimerDisplayModeToggle?: () => void;
  status?: ProviderStatus;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(diffMs: number): string {
  const seconds = Math.floor(Math.max(0, diffMs) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------

export function ProviderCard({
  name,
  plan,
  links = [],
  showSeparator = true,
  loading = false,
  error = null,
  lines = [],
  skeletonLines = [],
  lastManualRefreshAt,
  lastUpdatedAt,
  onRetry,
  scopeFilter = "all",
  displayMode,
  resetTimerDisplayMode = "relative",
  onResetTimerDisplayModeToggle,
  status,
}: ProviderCardProps) {
  const hasRetainedContent = lines.length > 0;
  const isRefreshingWithData = loading && hasRetainedContent;
  const cooldownRemainingMs = useMemo(() => {
    if (!lastManualRefreshAt) return 0;
    const remaining = REFRESH_COOLDOWN_MS - (Date.now() - lastManualRefreshAt);
    return remaining > 0 ? remaining : 0;
  }, [lastManualRefreshAt]);

  // Filter lines to overview-scoped subset when rendering in the overview panel.
  const overviewLabels = new Set(
    skeletonLines
      .filter((line) => line.scope === "overview")
      .map((line) => line.label),
  );
  const filteredSkeletonLines =
    scopeFilter === "all"
      ? skeletonLines
      : skeletonLines.filter((line) => line.scope === "overview");
  const filteredLines =
    scopeFilter === "all"
      ? lines
      : lines.filter((line) => overviewLabels.has(line.label));

  const hasResetCountdown = filteredLines.some(
    (line) => line.type === "progress" && Boolean(line.resetsAt),
  );

  const tickerIntervalMs = cooldownRemainingMs > 0 ? 1000 : 30_000;
  const now = useNowTicker({
    enabled: cooldownRemainingMs > 0 || hasResetCountdown,
    intervalMs: tickerIntervalMs,
    stopAfterMs:
      cooldownRemainingMs > 0 && !hasResetCountdown
        ? cooldownRemainingMs
        : null,
  });

  const inCooldown = lastManualRefreshAt
    ? now - lastManualRefreshAt < REFRESH_COOLDOWN_MS
    : false;

  const visibleLinks = useMemo(
    () =>
      links
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter(
          (link) =>
            link.label.length > 0 &&
            link.url.length > 0 &&
            (link.url.startsWith("https://") || link.url.startsWith("http://")),
        ),
    [links],
  );

  const formatRemainingTime = () => {
    if (!lastManualRefreshAt) return "";
    const remainingMs = REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt);
    if (remainingMs <= 0) return "";
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0
      ? `Available in ${minutes}m ${seconds}s`
      : `Available in ${seconds}s`;
  };

  return (
    <div>
      <div className="pt-1 pb-3">
        {/* ── Header row ── */}
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex min-w-0 flex-1 items-center">
            <h2
              className="truncate text-lg font-semibold"
              style={{ transform: "translateZ(0)" }}
            >
              {name}
            </h2>
            {onRetry &&
              (loading ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-1 pointer-events-none opacity-50"
                  style={{
                    transform: "translateZ(0)",
                    backfaceVisibility: "hidden",
                  }}
                  tabIndex={-1}
                >
                  <RefreshCw className="h-3 w-3 animate-spin" />
                </Button>
              ) : inCooldown ? (
                <Tooltip>
                  <TooltipTrigger
                    className="ml-1"
                    render={(props) => (
                      <span {...props} className={props.className}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="pointer-events-none opacity-50"
                          style={{
                            transform: "translateZ(0)",
                            backfaceVisibility: "hidden",
                          }}
                          tabIndex={-1}
                        >
                          <Hourglass className="h-3 w-3" />
                        </Button>
                      </span>
                    )}
                  />
                  <TooltipContent side="top">
                    {formatRemainingTime()}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger
                    className="ml-1"
                    render={(props) => (
                      <Button
                        {...props}
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Retry"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onRetry();
                        }}
                        className="opacity-0 hover:opacity-100 focus-visible:opacity-100"
                        style={{
                          transform: "translateZ(0)",
                          backfaceVisibility: "hidden",
                        }}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  />
                  {lastUpdatedAt != null && (
                    <TooltipContent side="top">
                      Updated {formatRelativeTime(Date.now() - lastUpdatedAt)}
                    </TooltipContent>
                  )}
                </Tooltip>
              ))}
          </div>
          <div className="flex max-w-[55%] shrink-0 items-center gap-1.5">
            {hasProviderStatusIssue(status) ? (
              <Badge
                variant="outline"
                className="border-destructive/55 text-destructive"
                title={providerStatusLabel(status) ?? undefined}
              >
                Incident
              </Badge>
            ) : null}
            {plan && (
              <Badge
                variant="outline"
                className="max-w-full shrink-0 truncate whitespace-nowrap"
                title={plan}
              >
                {plan}
              </Badge>
            )}
          </div>
        </div>

        {/* ── Incident banner ── */}
        {hasProviderStatusIssue(status) ? (
          <div className="mb-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            {providerStatusLabel(status)}
          </div>
        ) : null}

        {/* ── External links ── */}
        {visibleLinks.length > 0 && (
          <div className="mb-2 -mt-0.5 flex flex-wrap gap-1.5">
            {visibleLinks.map((link) => (
              <Button
                key={`${link.label}-${link.url}`}
                variant="outline"
                size="xs"
                className="h-6 max-w-full text-[11px]"
                onClick={() => {
                  openUrl(link.url).catch(console.error);
                }}
              >
                <span className="truncate">{link.label}</span>
                <ExternalLink className="size-3 opacity-70" />
              </Button>
            ))}
          </div>
        )}

        {/* ── Error states ── */}
        {error && !hasRetainedContent && (
          <div className="space-y-1.5">
            <PluginError message={error} />
            {/* Surface the last-success time so users can judge staleness at a glance. */}
            {lastUpdatedAt != null && (
              <p className="text-xs text-muted-foreground pl-0.5">
                Last successful:{" "}
                <span className="tabular-nums">
                  {formatRelativeTime(Date.now() - lastUpdatedAt)}
                </span>
              </p>
            )}
          </div>
        )}
        {error && hasRetainedContent && (
          <Tooltip>
            <TooltipTrigger
              render={(props) => (
                <div
                  {...props}
                  className="mb-2 flex items-center gap-1.5 text-xs text-destructive"
                >
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}
            />
            <TooltipContent side="top" className="max-w-xs break-words text-xs">
              <div>{error}</div>
              {lastUpdatedAt != null && (
                <div className="mt-1 opacity-70">
                  Last successful:{" "}
                  {formatRelativeTime(Date.now() - lastUpdatedAt)}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Loading skeletons (first load, no retained data yet) ── */}
        {loading && !hasRetainedContent && !error && (
          <SkeletonLines lines={filteredSkeletonLines} />
        )}

        {/* ── Metric lines ── */}
        {hasRetainedContent && (
          <div className="space-y-4">
            {groupLinesByType(filteredLines).map((group, gi) =>
              group.kind === "text" ? (
                <div key={gi} className="space-y-1">
                  {group.lines.map((line, li) => (
                    <MetricLineRenderer
                      key={`${line.label}-${gi}-${li}`}
                      line={line}
                      displayMode={displayMode}
                      resetTimerDisplayMode={resetTimerDisplayMode}
                      onResetTimerDisplayModeToggle={
                        onResetTimerDisplayModeToggle
                      }
                      now={now}
                      refreshing={isRefreshingWithData}
                    />
                  ))}
                </div>
              ) : (
                <Fragment key={gi}>
                  {group.lines.map((line, li) => (
                    <MetricLineRenderer
                      key={`${line.label}-${gi}-${li}`}
                      line={line}
                      displayMode={displayMode}
                      resetTimerDisplayMode={resetTimerDisplayMode}
                      onResetTimerDisplayModeToggle={
                        onResetTimerDisplayModeToggle
                      }
                      now={now}
                      refreshing={isRefreshingWithData}
                    />
                  ))}
                </Fragment>
              ),
            )}
          </div>
        )}

        {/* ── Background-refresh indicator (data present + loading in parallel) ── */}
        {loading && hasRetainedContent && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Refreshing usage
          </div>
        )}
      </div>
      {showSeparator && <Separator />}
    </div>
  );
}
