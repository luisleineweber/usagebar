import { useMemo } from "react"
import { Clock3, Download, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AboutDialog } from "@/components/about-dialog"
import type { UpdateStatus } from "@/hooks/use-app-update"
import { useNowTicker } from "@/hooks/use-now-ticker"
import { APP_NAME } from "@/lib/project-metadata"

interface PanelFooterProps {
  version: string
  lastUpdatedAt?: number | null
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

function VersionDisplay({
  version,
  updateStatus,
  onUpdateInstall,
  onUpdateCheck,
  onVersionClick,
}: {
  version: string
  updateStatus: UpdateStatus
  onUpdateInstall: () => void
  onUpdateCheck: () => void
  onVersionClick: () => void
}) {
  const versionButton = (
    label = formatFooterVersionLabel(version),
    title = `${APP_NAME} ${version}. Right-click to check for updates.`
  ) => (
    <button
      type="button"
      onClick={onVersionClick}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onUpdateCheck()
      }}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      title={title}
    >
      {label}
    </button>
  )

  switch (updateStatus.status) {
    case "checking":
      return (
        <span role="status" className="text-xs text-muted-foreground">
          Checking for updates...
        </span>
      )
    case "up-to-date":
      return (
        <span role="status" className="text-xs text-muted-foreground">
          Up to date
        </span>
      )
    case "available":
      return (
        <Button
          variant="default"
          size="xs"
          className="rounded-md border-primary/20 bg-primary/5 text-primary shadow-none hover:border-primary/40 hover:bg-primary hover:text-primary-foreground dark:border-page-accent/55 dark:bg-page-accent/10 dark:text-page-accent dark:hover:border-page-accent dark:hover:bg-page-accent dark:hover:text-primary-foreground"
          onClick={onUpdateInstall}
          title={updateStatus.error ? "Download failed. Try again." : "Download update"}
        >
          <Download className="size-3" aria-hidden />
          Update to {updateStatus.version}
        </Button>
      )
    case "downloading":
      return (
        <span role="status" className="text-xs text-muted-foreground">
          {updateStatus.progress >= 0
            ? `Downloading update ${updateStatus.progress}%`
            : "Downloading update..."}
        </span>
      )
    case "ready":
      return (
        <Button variant="default" size="xs" onClick={onUpdateInstall} title="Restart to update">
          <RotateCw className="size-3" aria-hidden />
          Restart to update
        </Button>
      )
    case "installing":
      return (
        <span role="status" className="text-xs text-muted-foreground">
          Installing...
        </span>
      )
    case "unavailable":
      return (
        <span role="status" className="text-xs text-muted-foreground" title={updateStatus.message}>
          Updates unavailable
        </span>
      )
    case "error":
      if (updateStatus.message === "Update check failed") {
        return (
          <span role="alert">
            {versionButton("Update check failed", "Update check failed. Right-click to try again.")}
          </span>
        )
      }
      return (
        <span role="alert" className="text-xs text-destructive" title={updateStatus.message}>
          Update failed
        </span>
      )
    default:
      return versionButton()
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
  lastUpdatedAt = null,
  autoUpdateNextAt,
  updateStatus,
  onUpdateInstall,
  onUpdateCheck,
  onRefreshAll,
  showAbout,
  onShowAbout,
  onCloseAbout,
}: PanelFooterProps) {
  const now = useNowTicker({
    enabled: Boolean(autoUpdateNextAt || lastUpdatedAt),
    resetKey: `${autoUpdateNextAt ?? "paused"}:${lastUpdatedAt ?? "never"}`,
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
    ? `Next automatic update in ${countdownLabel}`
    : "Automatic updates paused"
  const updatedLabel =
    lastUpdatedAt == null ? "Not updated yet" : `Updated ${formatRelativeTime(now - lastUpdatedAt)}`

  return (
    <>
      <div className="flex h-8 items-center justify-between gap-2 border-t pt-1.5">
        <VersionDisplay
          version={version}
          updateStatus={updateStatus}
          onUpdateInstall={onUpdateInstall}
          onUpdateCheck={onUpdateCheck}
          onVersionClick={onShowAbout}
        />
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span
            className="truncate text-xs text-muted-foreground tabular-nums"
            title={updatedLabel}
          >
            {updatedLabel}
          </span>
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
      {showAbout && <AboutDialog version={version} onClose={onCloseAbout} />}
    </>
  )
}
