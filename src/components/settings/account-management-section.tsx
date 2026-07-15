import { Button } from "@/components/ui/button"
import { CodexAccountsSection } from "@/components/settings/codex-accounts-section"
import { getProviderAccountCapabilities } from "@/lib/account-capabilities"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"

export function AccountManagementSection({
  providerId,
  definition,
  connected,
  stale,
  config,
  credentialStored,
  onConfigChange,
  onPing,
  onReauthenticate,
  onRemoveCredential,
}: {
  providerId: string
  definition: ProviderSettingsDefinition
  connected: boolean
  stale: boolean
  config?: ProviderConfig
  credentialStored: boolean
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onPing: () => void
  onReauthenticate: () => void
  onRemoveCredential: () => void
}) {
  const capabilities = getProviderAccountCapabilities(providerId, definition)
  return (
    <div className="border-t border-border/55 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Account & Connection
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected ? (stale ? "Last successful data is stale." : "Provider connection is healthy.") : "Provider is not connected."}
          </p>
        </div>
        <span className={connected && !stale ? "text-xs font-medium text-primary" : "text-xs font-medium text-destructive"}>
          {connected ? (stale ? "Stale" : "Connected") : "Attention needed"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {capabilities.ping ? <Button type="button" size="xs" variant="outline" onClick={onPing}>Ping now</Button> : null}
        {capabilities.reauthenticate ? <Button type="button" size="xs" variant="outline" onClick={onReauthenticate}>Re-authenticate</Button> : null}
        {capabilities.removeCredential && credentialStored ? (
          <Button type="button" size="xs" variant="outline" className="text-destructive hover:text-destructive" onClick={onRemoveCredential}>
            Remove credential
          </Button>
        ) : null}
      </div>
      {capabilities.managedProfiles ? (
        <CodexAccountsSection config={config} onConfigChange={onConfigChange} />
      ) : null}
    </div>
  )
}
