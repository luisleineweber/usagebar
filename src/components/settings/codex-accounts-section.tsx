import { ManagedAccountsView } from "@/components/settings/managed-accounts-view"
import { useManagedAccounts } from "@/components/settings/use-managed-accounts"
import {
  deleteCodexAccountProfile,
  importCurrentCodexAccountProfile,
  listCodexAccountProfiles,
} from "@/lib/codex-accounts"
import type { ProviderConfig } from "@/lib/provider-settings"

const CODEX_ACCOUNTS_API = {
  list: () => listCodexAccountProfiles(),
  importCurrent: () => importCurrentCodexAccountProfile(),
  remove: (profileId: string) => deleteCodexAccountProfile(profileId),
}

type CodexAccountsSectionProps = {
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}

export function CodexAccountsSection({ config, onConfigChange }: CodexAccountsSectionProps) {
  const accounts = useManagedAccounts({
    providerId: "codex",
    providerName: "Codex",
    api: CODEX_ACCOUNTS_API,
    config,
    onConfigChange,
  })

  return (
    <ManagedAccountsView
      providerId="codex"
      providerName="Codex"
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
