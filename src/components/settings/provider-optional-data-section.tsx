import { ProviderSecretField } from "@/components/settings/provider-secret-field"
import { SettingsFeedbackLine } from "@/components/settings/settings-feedback-line"
import type { ProviderSettingsActions } from "@/components/settings/use-provider-settings-actions"
import {
  hasProviderSecret,
  type ProviderConfig,
  type ProviderSettingsDefinition,
} from "@/lib/provider-settings"

const GROUP_TITLE_CLASS = "text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"

/** The secret field for a provider whose secret adds optional data and does not sign in. */
export function getOptionalDataSecretField(definition: ProviderSettingsDefinition) {
  return definition.secretFieldRole === "optionalData" ? definition.secretField : undefined
}

/** A credential that adds optional data, such as dashboard history. Sign-in happens elsewhere. */
export function ProviderOptionalDataSection({
  className,
  providerId,
  definition,
  config,
  actions,
}: {
  className: string
  providerId: string
  definition: ProviderSettingsDefinition
  config?: ProviderConfig
  actions: ProviderSettingsActions
}) {
  const field = getOptionalDataSecretField(definition)
  if (!field) return null
  return (
    <div className={className}>
      <h4 className={GROUP_TITLE_CLASS}>Optional data</h4>
      <div className="mt-3">
        <ProviderSecretField
          inputId={`provider-secret-${providerId}`}
          resetKey={providerId}
          field={field}
          stateLabel="Secret state"
          stored={hasProviderSecret(config, field.key)}
          updatedAt={config?.secrets?.[field.key]?.updatedAt ?? null}
          storageNote="Secrets are stored by the app and are not shown again after saving."
          busy={actions.savingSecret}
          onSave={
            actions.canSaveSecret ? (value) => actions.saveSecret(field.key, value) : undefined
          }
          onDelete={actions.canDeleteSecret ? () => actions.deleteSecret(field.key) : undefined}
          onEmptySave={() =>
            actions.showFeedback({ error: `Enter the ${field.label} before saving.` })
          }
        />
      </div>
      <SettingsFeedbackLine message={actions.message} error={actions.error} />
    </div>
  )
}
