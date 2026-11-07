import {
  AccountManagementSection,
  hasManagedAccounts,
} from "@/components/settings/account-management-section"
import {
  ProviderRuntimeStatus,
  getProbeStatus,
} from "@/components/settings/provider-runtime-status"
import { ProviderOptionalDataSection } from "@/components/settings/provider-optional-data-section"
import { ProviderSettingsHeader } from "@/components/settings/provider-settings-header"
import { getSignInSecretField } from "@/components/settings/provider-sign-in-options"
import { ProviderSignInSection } from "@/components/settings/provider-sign-in-section"
import { ProviderTextSetting } from "@/components/settings/provider-text-setting"
import { ReportingSourceSettings } from "@/components/settings/reporting-source-settings"
import { useProviderSettingsActions } from "@/components/settings/use-provider-settings-actions"
import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta } from "@/lib/plugin-types"
import { getProviderConnectionState } from "@/lib/provider-connection-state"
import {
  getProviderSettingsDefinition,
  getProviderSourceLabel,
  hasProviderSecret,
  hasProviderSettingsDefinition,
  type ProviderConfig,
  type ProviderSettingsDefinition,
} from "@/lib/provider-settings"
import { getProviderSignIn } from "@/lib/provider-sign-in-state"

export type ProviderSettingsDetailProps = {
  plugin: PluginMeta
  enabled: boolean
  config?: ProviderConfig
  state?: PluginState
  onEnabledChange: (enabled: boolean) => void
  onRetry?: () => void
  onOpenInTray?: () => void
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onSecretSave?: (providerId: string, secretKey: string, value: string) => Promise<void>
  onSecretDelete?: (providerId: string, secretKey: string) => Promise<void>
}

// One section rhythm: every top-level group owns a divider and 16px above and below.
// The first group follows the header divider, so it drops its own divider.
const GROUP_CLASS = "border-t border-border/55 py-4 first:border-t-0 first:pt-0"
const GROUP_TITLE_CLASS = "text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"

function storedCredentialLabels(
  definition: ProviderSettingsDefinition,
  config: ProviderConfig | undefined
): string[] {
  return [getSignInSecretField(definition), definition.additionalSecretField]
    .filter((field) => field !== undefined && hasProviderSecret(config, field.key))
    .map((field) => `the stored ${field?.label}`)
}

export function ProviderSettingsDetail({
  plugin,
  enabled,
  config,
  state,
  onEnabledChange,
  onRetry,
  onOpenInTray,
  onConfigChange,
  onSecretSave,
  onSecretDelete,
}: ProviderSettingsDetailProps) {
  const definition = getProviderSettingsDefinition(plugin.id)
  const loading = Boolean(state?.loading)
  const connectionState = getProviderConnectionState({
    enabled,
    supported: plugin.supportState !== "comingSoonOnWindows",
    state: {
      data: state?.data ?? null,
      error: state?.error ?? null,
      loading,
      lastSettledError: state?.lastSettledError,
    },
  })
  // A running check clears `errorCategory`; the last settled category stays in probe state.
  const signIn = getProviderSignIn({
    connectionState,
    settledErrorCategory: loading ? state?.lastSettledErrorCategory : state?.errorCategory,
    setupChecks: definition.setupChecks,
    detections: state?.setupDetection,
    storedCredentialLabels: storedCredentialLabels(definition, config),
  })
  const actions = useProviderSettingsActions({
    providerId: plugin.id,
    definition,
    onConfigChange,
    onSecretSave,
    onSecretDelete,
  })
  // Optional data has its own feedback line, next to its own field.
  const optionalDataActions = useProviderSettingsActions({
    providerId: plugin.id,
    definition,
    onConfigChange,
    onSecretSave,
    onSecretDelete,
  })

  // The Experimental badge already names the support state. A provider's own hint is the
  // specific guidance; the manifest message is used only when no settings definition exists.
  const hint =
    !hasProviderSettingsDefinition(plugin.id) && plugin.supportMessage
      ? plugin.supportMessage
      : (definition.connectHint ?? definition.statusHint)
  // Usage data without sign-in evidence uses the same layout as a sign-in: status first.
  const signInFirst = signIn.kind === "signedOut"
  const supported = connectionState !== "unsupported"
  const showTextSetting =
    definition.textField !== undefined &&
    definition.mode === "editable" &&
    (config?.source ?? "manual") === "manual"

  const status = (
    <ProviderRuntimeStatus
      key="status"
      providerName={plugin.name}
      errorCategory={state?.errorCategory}
      className={GROUP_CLASS}
      sourceLabel={getProviderSourceLabel(plugin.id, config)}
      lastSuccessAt={state?.lastSuccessAt ?? null}
      status={getProbeStatus(plugin, connectionState, state)}
    />
  )
  const signInSection = (
    <ProviderSignInSection
      key={`sign-in-${plugin.id}`}
      className={GROUP_CLASS}
      providerId={plugin.id}
      providerName={plugin.name}
      signIn={signIn}
      hint={hint}
      definition={definition}
      config={config}
      detections={state?.setupDetection}
      loading={loading}
      actions={actions}
      onSignedIn={onRetry}
    />
  )

  return (
    <section className="flex flex-col" data-testid={`provider-settings-${plugin.id}`}>
      <ProviderSettingsHeader
        plugin={plugin}
        summary={definition.summary}
        enabled={enabled}
        connectionState={connectionState}
        loading={loading}
        onEnabledChange={onEnabledChange}
        onCheck={onRetry}
        onOpenInTray={onOpenInTray}
      />

      <div className="mt-4 pr-1 text-sm">
        {/* Signed out, signing in is the focus. Otherwise the current status comes first. */}
        {!supported ? status : signInFirst ? [signInSection, status] : [status, signInSection]}

        {/* Account switching stays available during a credential error, to recover from it. */}
        {supported && hasManagedAccounts(definition) ? (
          <AccountManagementSection
            className={GROUP_CLASS}
            providerId={plugin.id}
            providerName={plugin.name}
            config={config}
            onConfigChange={onConfigChange}
          />
        ) : null}

        {supported && showTextSetting && definition.textField ? (
          <div className={GROUP_CLASS}>
            <h4 className={GROUP_TITLE_CLASS}>Settings</h4>
            <div className="mt-3">
              <ProviderTextSetting
                providerId={plugin.id}
                field={definition.textField}
                value={config?.workspaceId}
                onConfigChange={onConfigChange}
              />
            </div>
          </div>
        ) : null}

        {supported ? (
          <ProviderOptionalDataSection
            className={GROUP_CLASS}
            providerId={plugin.id}
            definition={definition}
            config={config}
            actions={optionalDataActions}
          />
        ) : null}

        {supported && (plugin.id === "claude" || plugin.id === "codex") && (
          <ReportingSourceSettings
            providerId={plugin.id}
            config={config}
            onConfigChange={onConfigChange}
          />
        )}
      </div>
    </section>
  )
}
