import { CodexAccountsSection } from "@/components/settings/codex-accounts-section"
import { ProviderAccountsSection } from "@/components/settings/provider-accounts-section"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"

/** Whether the provider supports app-managed account profiles. */
export function hasManagedAccounts(definition: ProviderSettingsDefinition): boolean {
  return definition.managedAccounts === true
}

/**
 * App-managed account profiles. The header already shows the connection state, and the
 * sign-in section owns credential actions, so this section shows only the accounts.
 */
export function AccountManagementSection({
  className,
  providerId,
  providerName,
  config,
  onConfigChange,
}: {
  className: string
  providerId: string
  providerName: string
  config?: ProviderConfig
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}) {
  return (
    <div className={className}>
      {providerId === "codex" ? (
        <CodexAccountsSection config={config} onConfigChange={onConfigChange} />
      ) : (
        <ProviderAccountsSection
          providerId={providerId}
          providerName={providerName}
          config={config}
          onConfigChange={onConfigChange}
        />
      )}
    </div>
  )
}
