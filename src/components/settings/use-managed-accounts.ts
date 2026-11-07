import { useEffect, useState } from "react"
import type { ManagedAccountProfileView } from "@/components/settings/managed-accounts-view"
import { getErrorMessage } from "@/lib/error-utils"
import type { ProviderConfig } from "@/lib/provider-settings"

/** The account-profile commands of one provider. */
export type ManagedAccountsApi<Profile extends ManagedAccountProfileView> = {
  list: () => Promise<Profile[]>
  importCurrent: () => Promise<{ profile: Profile; wasFirstProfile: boolean }>
  remove: (profileId: string) => Promise<unknown>
}

/**
 * State and actions for app-managed account profiles.
 *
 * A loaded list is bound to the `api` that returned it. Only a list from the current `api`
 * counts: after a provider switch, the list of the previous provider says nothing about the
 * new provider's pin. The pinned selection is cleared only when a successful list of the
 * current provider does not contain it. Before that list arrives, or after a failed list, the
 * selection is unknown and stays stored: clearing it then would delete a valid pin.
 */
export function useManagedAccounts<Profile extends ManagedAccountProfileView>({
  providerId,
  providerName,
  api,
  config,
  onConfigChange,
}: {
  providerId: string
  providerName: string
  /** Must be stable (module constant or useMemo); a new value loads the list again. */
  api: ManagedAccountsApi<Profile>
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}) {
  const [loaded, setLoaded] = useState<{
    source: ManagedAccountsApi<Profile>
    profiles: Profile[]
  } | null>(null)
  // Null until the current provider's list arrives; another provider's list is never used.
  const profiles = loaded?.source === api ? loaded.profiles : null
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedProfileId = config?.selectedAccountProfileId ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void api
      .list()
      .then((nextProfiles) => {
        if (!cancelled) setLoaded({ source: api, profiles: nextProfiles })
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, `Failed to load ${providerName} accounts.`))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, providerName])

  useEffect(() => {
    if (profiles === null || !selectedProfileId || !onConfigChange) return
    if (profiles.some((profile) => profile.profileId === selectedProfileId)) return

    void onConfigChange(providerId, { selectedAccountProfileId: undefined }).catch((clearError) => {
      setError(getErrorMessage(clearError, `Failed to clear the missing ${providerName} account.`))
    })
  }, [onConfigChange, profiles, providerId, providerName, selectedProfileId])

  const importCurrent = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const imported = await api.importCurrent()
      setLoaded({ source: api, profiles: await api.list() })
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

  const select = async (profileId: string) => {
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

  const remove = async (profileId: string) => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await api.remove(profileId)
      setLoaded({ source: api, profiles: await api.list() })
      if (selectedProfileId === profileId && onConfigChange) {
        await onConfigChange(providerId, { selectedAccountProfileId: undefined })
      }
      setMessage(`${providerName} account removed.`)
    } catch (removeError) {
      setError(getErrorMessage(removeError, `Failed to remove the ${providerName} account.`))
    } finally {
      setLoading(false)
    }
  }

  return {
    profiles: profiles ?? [],
    selectedProfileId,
    loading,
    message,
    error,
    importCurrent,
    select,
    remove,
  }
}
