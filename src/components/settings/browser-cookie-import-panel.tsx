import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  browserImportMessage,
  importBrowserCookies,
  listBrowserImportSources,
  type BrowserImportSource,
} from "@/lib/browser-cookie-import"
import { getErrorMessage } from "@/lib/error-utils"
import type { ProviderConfig } from "@/lib/provider-settings"

export const BROWSER_IMPORT_TITLE = "Microsoft Edge import"

export type SettingsFeedback = { message: string } | { error: string }

/**
 * Opt-in, provider-scoped Edge session import. The heading names the checkbox, so the
 * control and the section use the same term.
 */
export function BrowserCookieImportPanel({
  providerId,
  description,
  enabled,
  secretKey,
  config,
  savingConfig,
  onConfigChange,
  onEnabledChange,
  onImported,
  onFeedback,
}: {
  providerId: string
  description: string
  enabled: boolean
  secretKey: string
  config?: ProviderConfig
  savingConfig: boolean
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onEnabledChange: (enabled: boolean) => void
  onImported?: () => void
  /** Must be stable (useCallback); it is an effect dependency. */
  onFeedback: (feedback: SettingsFeedback) => void
}) {
  const [sources, setSources] = useState<BrowserImportSource[]>([])
  const [sourceId, setSourceId] = useState("edge")
  const [profileId, setProfileId] = useState("")
  const [importing, setImporting] = useState(false)
  const headingId = `${providerId}-browser-import-heading`
  const profileSelectId = `${providerId}-browser-import-profile`

  useEffect(() => {
    if (!enabled) {
      setSources([])
      setProfileId("")
      return
    }
    let cancelled = false
    void listBrowserImportSources(providerId)
      .then((nextSources) => {
        if (cancelled) return
        setSources(nextSources)
        const source = nextSources[0]
        setSourceId(source?.sourceId ?? "edge")
        setProfileId(source?.profiles[0] ?? "")
      })
      .catch((error) => {
        if (!cancelled) {
          onFeedback({ error: getErrorMessage(error, "Failed to inspect Edge profiles.") })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, onFeedback, providerId])

  const handleImport = async () => {
    if (!profileId || !onConfigChange) return
    setImporting(true)
    try {
      const result = await importBrowserCookies(providerId, sourceId, profileId)
      const message = browserImportMessage(result)
      if (result.code !== "ok") {
        onFeedback({ error: message })
        return
      }
      await onConfigChange(providerId, {
        secrets: { ...(config?.secrets ?? {}), [secretKey]: { updatedAt: Date.now() } },
      })
      onFeedback({ message })
      onImported?.()
    } catch (error) {
      onFeedback({ error: getErrorMessage(error, "Browser import failed.") })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            id={headingId}
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {BROWSER_IMPORT_TITLE}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Checkbox
          aria-labelledby={headingId}
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
          disabled={savingConfig}
        />
      </div>
      {enabled ? (
        sources.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={profileSelectId} className="text-xs text-muted-foreground">
                Edge profile
              </label>
              <select
                id={profileSelectId}
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                {sources
                  .flatMap((source) =>
                    source.profiles.map((profile) => ({ sourceId: source.sourceId, profile }))
                  )
                  .map((option) => (
                    <option key={`${option.sourceId}-${option.profile}`} value={option.profile}>
                      {option.profile}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleImport()}
              disabled={importing || !profileId}
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {importing ? "Importing..." : "Import session"}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No Edge profile with a cookie database was found. Manual entry remains available below.
          </p>
        )
      ) : null}
    </div>
  )
}
