import { useMemo } from "react"
import { ManagedAccountsView } from "@/components/settings/managed-accounts-view"
import { useManagedAccounts } from "@/components/settings/use-managed-accounts"
import {
  deleteProviderAccountProfile,
  importCurrentProviderAccountProfile,
  listProviderAccountProfiles,
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
  const api = useMemo(
    () => ({
      list: () => listProviderAccountProfiles(providerId),
      importCurrent: () => importCurrentProviderAccountProfile(providerId),
      remove: (profileId: string) => deleteProviderAccountProfile(providerId, profileId),
    }),
    [providerId]
  )
  const accounts = useManagedAccounts({ providerId, providerName, api, config, onConfigChange })

  return (
    <ManagedAccountsView
      providerId={providerId}
      providerName={providerName}
      profiles={accounts.profiles}
      selectedProfileId={accounts.selectedProfileId}
      loading={accounts.loading}
      message={accounts.message}
      error={accounts.error}
      onImport={() => void accounts.importCurrent()}
      onSelect={(profileId) => void accounts.select(profileId)}
      onDelete={(profileId) => void accounts.remove(profileId)}
    />
  )
}
