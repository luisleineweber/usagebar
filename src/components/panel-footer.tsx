import { useMemo } from "react"
import { AlertCircle, Clock3, Download, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AboutDialog } from "@/components/about-dialog"
import type { UpdateStatus } from "@/hooks/use-app-update"
import { useNowTicker } from "@/hooks/use-now-ticker"
import type { DataFreshness } from "@/lib/data-freshness"
import { APP_NAME } from "@/lib/project-metadata"

interface PanelFooterProps {
  version: string
  freshness: DataFreshness
  autoUpdateNextAt: number | null
  updateStatus: UpdateStatus
  onUpdateInstall: () => void
  onUpdateCheck: () => void
  onRefreshAll?: () => void
  showAbout: boolean
  onShowAbout: () => void
  onCloseAbout: () => void
}

function formatFooterVersionLabel(version: string): string {
  const normalized = version.trim().replace(/^v/i, "")
  const prerelease = normalized.split("-", 2)[1]
  const match = prerelease?.match(/^([a-z]+)\.(\d+)$/i)
  if (!match) return `${APP_NAME} ${version}`

  const [, channel, number] = match
  const titleChannel = channel.charAt(0).toUpperCase() + channel.slice(1).toLowerCase()
  return `${APP_NAME} ${titleChannel} ${number}`
}

function VersionButton({
  version,
  onVersionClick,
  onUpdateCheck,
}: {
  version: string
  onVersionClick: () => void
  onUpdateCheck: () => void
}) {
  return (
    <button
      type="button"
      onClick={onVersionClick}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onUpdateCheck()
      }}
      className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={`${APP_NAME} ${version}. Right-click to check for app updates.`}
    >
      {formatFooterVersionLabel(version)}
    </button>
  )
}

const STATUS_TEXT_CLASS = "min-w-0 truncate text-xs text-muted-foreground"

/** Actionable app update states get their own footer row so they never cover data freshness. */
function AppUpdateActionRow({
  updateStatus,
  onUpdateInstall,
}: {
  updateStatus: UpdateStatus
  onUpdateInstall: () => void
}) {
  if (updateStatus.status !== "available" && updateStatus.status !== "ready") return null
  return (
    <div data-slot="app-update-action" className="flex min-w-0 pb-1">
      {updateStatus.status === "available" ? (
        <Button
          variant="default"
          size="xs"
          className="min-w-0 shrink rounded-md border-primary/20 bg-primary/5 text-primary shadow-none hover:border-primary/40 hover:bg-primary hover:text-primary-foreground dark:border-page-accent/55 dark:bg-page-accent/10 dark:text-page-accent dark:hover:border-page-accent dark:hover:bg-page-accent dark:hover:text-primary-foreground"
          onClick={onUpdateInstall}
          title={updateStatus.error ? "Download failed. Try again." : "Download app update"}
        >
          <Download className="size-3" aria-hidden />
          <span className="truncate">Update to {updateStatus.version}</span>
        </Button>
      ) : (
        <Button
          variant="default"
          size="xs"
          className="min-w-0 shrink"
          onClick={onUpdateInstall}
          title="Restart to update the app"
        >
          <RotateCw className="size-3" aria-hidden />
          <span className="truncate">Restart to update</span>
        </Button>
      )}
    </div>
  )
}

function AppUpdateStatus({ updateStatus }: { updateStatus: UpdateStatus }) {
  switch (updateStatus.status) {
    case "checking":
      return (
        <span role="status" className={STATUS_TEXT_CLASS}>
          Checking for app update...
        </span>
      )
    case "up-to-date":
      return (
        <span role="status" className={STATUS_TEXT_CLASS}>
          App up to date
        </span>
      )
    case "downloading":
      return (
        <span role="status" className={STATUS_TEXT_CLASS}>
          {updateStatus.progress >= 0
            ? `Downloading app update ${updateStatus.progress}%`
            : "Downloading app update..."}
        </span>
      )
    case "installing":
      return (
        <span role="status" className={STATUS_TEXT_CLASS}>
          Installing app update...
        </span>
      )
    case "unavailable":
      return (
        <span role="status" className={STATUS_TEXT_CLASS} title={updateStatus.message}>
          App updates unavailable
        </span>
      )
    case "error":
      return (
        <span
          role="alert"
          className="min-w-0 truncate text-xs text-destructive"
          title={updateStatus.message}
        >
          {updateStatus.message === "Update check failed"
            ? "App update check failed"
            : "App update failed"}
        </span>
      )
    default:
      return null
  }
}

function formatRelativeTime(diffMs: number): string {
  const seconds = Math.floor(Math.max(0, diffMs) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function PanelFooter({
  version,
  freshness,
  autoUpdateNextAt,
  updateStatus,
  onUpdateInstall,
  onUpdateCheck,
  onRefreshAll,
  showAbout,
  onShowAbout,
  onCloseAbout,
}: PanelFooterProps) {
  const lastSuccessAt =
    freshness.kind === "fresh" || freshness.kind === "failed" ? freshness.lastSuccessAt : null
  const now = useNowTicker({
    enabled: Boolean(autoUpdateNextAt || lastSuccessAt),
    resetKey: `${autoUpdateNextAt ?? "paused"}:${lastSuccessAt ?? "never"}`,
  })

  const countdownLabel = useMemo(() => {
    if (!autoUpdateNextAt) return "Paused"
    const remainingMs = Math.max(0, autoUpdateNextAt - now)
    const totalSeconds = Math.ceil(remainingMs / 1000)
    if (totalSeconds >= 60) {
      const minutes = Math.ceil(totalSeconds / 60)
      return `${minutes}m`
    }
    return `${totalSeconds}s`
  }, [autoUpdateNextAt, now])

  const autoUpdateDescription = autoUpdateNextAt
    ? `Next automatic refresh in ${countdownLabel}`
    : "Automatic refresh paused"
  const lastSuccessText =
    lastSuccessAt == null ? null : `Data updated ${formatRelativeTime(now - lastSuccessAt)}`

  return (
    <>
      <div className="border-t pt-1.5">
        <AppUpdateActionRow updateStatus={updateStatus} onUpdateInstall={onUpdateInstall} />
        <div className="flex h-[26px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <VersionButton
              version={version}
              onVersionClick={onShowAbout}
              onUpdateCheck={onUpdateCheck}
            />
            <AppUpdateStatus updateStatus={updateStatus} />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {freshness.kind === "failed" ? (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs text-destructive tabular-nums"
                title={`Refresh failed for ${freshness.failedCount} of ${freshness.totalCount} providers.${lastSuccessText ? ` ${lastSuccessText}.` : ""}`}
              >
                <AlertCircle className="size-3 shrink-0" aria-hidden />
                <span>
                  {freshness.failedCount} of {freshness.totalCount} failed
                </span>
              </span>
            ) : (
              <span
                role={freshness.kind === "refreshing" ? "status" : undefined}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {freshness.kind === "refreshing"
                  ? "Refreshing..."
                  : (lastSuccessText ?? "No data yet")}
              </span>
            )}
            {autoUpdateNextAt !== null && onRefreshAll ? (
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.blur()
                  onRefreshAll()
                }}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums transition-colors hover:text-foreground"
                aria-label={`${autoUpdateDescription}. Click to refresh now.`}
                title={`${autoUpdateDescription}. Click to refresh now.`}
              >
                <Clock3 className="size-3" aria-hidden />
                {countdownLabel}
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                <Clock3 className="size-3" aria-hidden />
                {countdownLabel}
              </span>
            )}
          </div>
        </div>
      </div>
      {showAbout && <AboutDialog version={version} onClose={onCloseAbout} />}
    </>
  )
}
