import { useEffect, useState } from "react"
import { ManagedAccountsView } from "@/components/settings/managed-accounts-view"
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
    if (!selectedProfileId || profiles.some((profile) => profile.profileId === selectedProfileId))
      return
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
    <ManagedAccountsView
      providerId={"codex"}
      providerName={"Codex"}
      profiles={profiles}
      selectedProfileId={selectedProfileId}
      loading={loading}
      message={message}
      error={error}
      onImport={() => void handleImport()}
      onSelect={(profileId) => void handleSelect(profileId)}
      onDelete={(profileId) => void handleDelete(profileId)}
    />
  )
}
