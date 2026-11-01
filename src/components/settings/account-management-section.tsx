import { Button } from "@/components/ui/button"
import { CodexAccountsSection } from "@/components/settings/codex-accounts-section"
import { ProviderAccountsSection } from "@/components/settings/provider-accounts-section"
import { ProviderConnectionBadge } from "@/components/settings/provider-connection-badge"
import { getProviderAccountCapabilities } from "@/lib/account-capabilities"
import type { ProviderConnectionState } from "@/lib/provider-connection-state"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"

function connectionDetail(state: ProviderConnectionState, stale: boolean): string {
  switch (state) {
    case "connected":
      return stale
        ? "The last successful check was more than 30 minutes ago."
        : "The last check succeeded."
    case "error":
      return "The last check failed. See Runtime status for the reason."
    case "setupNeeded":
      return "No check has completed yet."
    case "disabled":
      return "This provider is turned off."
  }
}

export function AccountManagementSection({
  providerId,
  providerName,
  definition,
  connectionState,
  stale,
  config,
  credentialStored,
  onConfigChange,
  onReauthenticate,
  onRemoveCredential,
}: {
  providerId: string
  providerName: string
  definition: ProviderSettingsDefinition
  connectionState: ProviderConnectionState
  stale: boolean
  config?: ProviderConfig
  credentialStored: boolean
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onReauthenticate: () => void
  onRemoveCredential: () => void
}) {
  const capabilities = getProviderAccountCapabilities(providerId, definition)
  // Credential actions act on an app-stored credential. Without one there is nothing to renew.
  const showReauthenticate = capabilities.reauthenticate && credentialStored
  const showRemoveCredential = capabilities.removeCredential && credentialStored
  return (
    <div className="border-t border-border/55 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Account & Connection
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">
            {connectionDetail(connectionState, stale)}
          </p>
        </div>
        <ProviderConnectionBadge state={connectionState} />
      </div>
      {showReauthenticate || showRemoveCredential ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {showReauthenticate ? (
            <Button type="button" size="sm" variant="outline" onClick={onReauthenticate}>
              Re-authenticate
            </Button>
          ) : null}
          {showRemoveCredential ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onRemoveCredential}
            >
              Remove credential
            </Button>
          ) : null}
        </div>
      ) : null}
      {capabilities.managedProfiles ? (
        providerId === "codex" ? (
          <CodexAccountsSection config={config} onConfigChange={onConfigChange} />
        ) : (
          <ProviderAccountsSection
            providerId={providerId}
            providerName={providerName}
            config={config}
            onConfigChange={onConfigChange}
          />
        )
      ) : null}
    </div>
  )
}
