import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getErrorMessage } from "@/lib/error-utils"
import {
  deleteCodexAccountProfile,
  importCurrentCodexAccountProfile,
  listCodexAccountProfiles,
  type CodexAccountProfile,
} from "@/lib/codex-accounts"
import type { ProviderConfig } from "@/lib/provider-settings"

type CodexAccountsSectionProps = {
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}

function accountCaption(profile: CodexAccountProfile): string {
  return profile.email ?? profile.accountId ?? profile.sourceKind
}

export function CodexAccountsSection({ config, onConfigChange }: CodexAccountsSectionProps) {
  const [profiles, setProfiles] = useState<CodexAccountProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedProfileId = config?.selectedAccountProfileId ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void listCodexAccountProfiles()
      .then((nextProfiles) => {
        if (cancelled) return
        setProfiles(nextProfiles)
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(getErrorMessage(loadError, "Failed to load Codex accounts."))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedProfileId || profiles.some((profile) => profile.profileId === selectedProfileId)) return
    if (!onConfigChange) return

    void onConfigChange("codex", { selectedAccountProfileId: undefined }).catch((clearError) => {
      setError(getErrorMessage(clearError, "Failed to clear missing Codex account selection."))
    })
  }, [onConfigChange, profiles, selectedProfileId])

  const handleImport = async () => {
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      const imported = await importCurrentCodexAccountProfile()
      const nextProfiles = await listCodexAccountProfiles()
      setProfiles(nextProfiles)
      if (onConfigChange && (imported.wasFirstProfile || !selectedProfileId)) {
        await onConfigChange("codex", { selectedAccountProfileId: imported.profile.profileId })
      }
      setMessage(`Imported ${imported.profile.label}.`)
    } catch (importError) {
      setError(getErrorMessage(importError, "Failed to import the current Codex login."))
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (profileId: string) => {
    if (!onConfigChange) return
    setError(null)
    setMessage(null)
    try {
      await onConfigChange("codex", { selectedAccountProfileId: profileId })
      setMessage("Active Codex account updated.")
    } catch (selectError) {
      setError(getErrorMessage(selectError, "Failed to update the active Codex account."))
    }
  }

  const handleDelete = async (profileId: string) => {
    setError(null)
    setMessage(null)
    setLoading(true)
    try {
      await deleteCodexAccountProfile(profileId)
      const nextProfiles = await listCodexAccountProfiles()
      setProfiles(nextProfiles)
      if (selectedProfileId === profileId && onConfigChange) {
        await onConfigChange("codex", { selectedAccountProfileId: undefined })
      }
      setMessage("Codex account removed.")
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Failed to remove the Codex account."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-border/55 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Codex Accounts
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Import the current Codex CLI login into an app-managed profile when you want UsageBar to stay pinned to one account.
          </p>
        </div>
        <Button type="button" size="xs" onClick={() => void handleImport()} disabled={loading}>
          Import current login
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {profiles.length === 0 ? (
          <div className="border-t border-dashed border-border/55 py-3 text-sm text-muted-foreground">
            No imported Codex accounts yet. The provider still falls back to the detected local login until you import one.
          </div>
        ) : (
          profiles.map((profile) => {
            const selected = profile.profileId === selectedProfileId
            return (
              <div
                key={profile.profileId}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border/55 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void handleSelect(profile.profileId)}
                >
                  <div className="truncate text-sm font-medium text-foreground">{profile.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{accountCaption(profile)}</div>
                </button>
                <div className="flex items-center gap-2">
                  {selected && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Active
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void handleDelete(profile.profileId)}
                    disabled={loading}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {message && <p className="mt-3 text-xs text-primary">{message}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  )
}
