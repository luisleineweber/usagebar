import { useEffect, useState } from "react"
import { ManagedAccountsView } from "@/components/settings/managed-accounts-view"
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
    <ManagedAccountsView
      providerId={providerId}
      providerName={providerName}
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
