import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getErrorMessage } from "@/lib/error-utils"
import {
  deleteProviderAccountProfile,
  importCurrentProviderAccountProfile,
  listProviderAccountProfiles,
  type ProviderAccountProfile,
} from "@/lib/provider-accounts"
import type { ProviderConfig } from "@/lib/provider-settings"

export function ProviderAccountsSection({
  providerId,
  providerName,
  config,
  onConfigChange,
}: {
  providerId: string
  providerName: string
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}) {
  const [profiles, setProfiles] = useState<ProviderAccountProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedProfileId = config?.selectedAccountProfileId ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listProviderAccountProfiles(providerId)
      .then((nextProfiles) => {
        if (!cancelled) setProfiles(nextProfiles)
      })
      .catch((loadError) => {
        if (!cancelled)
          setError(getErrorMessage(loadError, `Failed to load ${providerName} accounts.`))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [providerId, providerName])

  useEffect(() => {
    if (!selectedProfileId || profiles.some((profile) => profile.profileId === selectedProfileId)) {
      return
    }
    if (!onConfigChange) return

    void onConfigChange(providerId, { selectedAccountProfileId: undefined }).catch((clearError) => {
      setError(getErrorMessage(clearError, `Failed to clear the missing ${providerName} account.`))
    })
  }, [onConfigChange, profiles, providerId, providerName, selectedProfileId])

  const handleImport = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const imported = await importCurrentProviderAccountProfile(providerId)
      setProfiles(await listProviderAccountProfiles(providerId))
      if (onConfigChange && (imported.wasFirstProfile || !selectedProfileId)) {
        await onConfigChange(providerId, { selectedAccountProfileId: imported.profile.profileId })
      }
      setMessage(`Imported ${imported.profile.label}.`)
    } catch (importError) {
      setError(getErrorMessage(importError, `Failed to import the current ${providerName} login.`))
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (profileId: string) => {
    if (!onConfigChange) return
    setError(null)
    setMessage(null)
    try {
      await onConfigChange(providerId, { selectedAccountProfileId: profileId })
      setMessage(`Active ${providerName} account updated.`)
    } catch (selectError) {
      setError(getErrorMessage(selectError, `Failed to update the active ${providerName} account.`))
    }
  }

  const handleDelete = async (profileId: string) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await deleteProviderAccountProfile(providerId, profileId)
      setProfiles(await listProviderAccountProfiles(providerId))
      if (selectedProfileId === profileId && onConfigChange) {
        await onConfigChange(providerId, { selectedAccountProfileId: undefined })
      }
      setMessage(`${providerName} account removed.`)
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, `Failed to remove the ${providerName} account.`))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-border/55 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {providerName} Accounts
        </h4>
        <Button type="button" size="xs" onClick={() => void handleImport()} disabled={loading}>
          Import current login
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {profiles.length === 0 ? (
          <div className="border-t border-dashed border-border/55 py-3 text-sm text-muted-foreground">
            No imported {providerName} accounts.
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
                  <div className="truncate text-sm font-medium text-foreground">
                    {profile.label}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {profile.email ?? profile.accountId ?? profile.sourceKind}
                  </div>
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

      {message && (
        <p role="status" className="mt-3 text-xs text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
