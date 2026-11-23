import { useMemo } from "react"
import { ManagedAccountsView } from "@/components/settings/managed-accounts-view"
import { useManagedAccounts } from "@/components/settings/use-managed-accounts"
import {
  deleteProviderAccountProfile,
  importCurrentProviderAccountProfile,
  listProviderAccountProfiles,
  linkCurrentClaudeCodeLogin,
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
      linkCurrent:
        providerId === "claude"
          ? (profileId: string) => linkCurrentClaudeCodeLogin(profileId, true)
          : undefined,
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
      onLink={api.linkCurrent ? (profileId) => void accounts.linkCurrent(profileId) : undefined}
      onSelect={(profileId) => void accounts.select(profileId)}
      onDelete={(profileId) => void accounts.remove(profileId)}
    />
  )
}
