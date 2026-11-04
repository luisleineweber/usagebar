import {
  BrowserCookieImportPanel,
  BROWSER_IMPORT_TITLE,
} from "@/components/settings/browser-cookie-import-panel"
import { GuidedCookieLoginPanel } from "@/components/settings/guided-cookie-login-panel"
import { ProviderSecretField } from "@/components/settings/provider-secret-field"
import type { ProviderSettingsActions } from "@/components/settings/use-provider-settings-actions"
import {
  hasProviderSecret,
  type ProviderConfig,
  type ProviderSettingsDefinition,
  type ProviderSourceMode,
} from "@/lib/provider-settings"

const FIELD_LABEL_CLASS =
  "mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"

/** The secret field that signs in, or undefined when the provider has none. */
export function getSignInSecretField(definition: ProviderSettingsDefinition) {
  return definition.secretFieldRole === "optionalData" ? undefined : definition.secretField
}

/** Whether the provider offers any app-side way to sign in or choose the sign-in source. */
export function hasSignInOptions(definition: ProviderSettingsDefinition): boolean {
  return Boolean(
    definition.sourceOptions || getSignInSecretField(definition) || definition.additionalSecretField
  )
}

/**
 * The ways to sign in, fastest first: guided login, Edge import, then manual entry.
 * The same options serve the sign-in view and the "Change sign-in" panel.
 */
export function ProviderSignInOptions({
  providerId,
  definition,
  config,
  actions,
  onSignedIn,
}: {
  providerId: string
  definition: ProviderSettingsDefinition
  config?: ProviderConfig
  actions: ProviderSettingsActions
  onSignedIn?: () => void
}) {
  const sourceValue = (config?.source ?? "manual") as ProviderSourceMode
  const showManualFields = definition.mode === "editable" && sourceValue === "manual"
  const secretField = getSignInSecretField(definition)
  const additionalSecret = definition.additionalSecretField
  const sourceSelectId = `provider-source-${providerId}`

  return (
    <div className="space-y-4">
      {definition.sourceOptions && (
        <div>
          <label htmlFor={sourceSelectId} className={FIELD_LABEL_CLASS}>
            Source
          </label>
          <select
            id={sourceSelectId}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
            value={sourceValue}
            onChange={(event) => {
              const next = event.target.value === "auto" ? "auto" : "manual"
              void actions.saveConfig(
                { source: next },
                `Source set to ${next === "manual" ? "Manual" : "Automatic"}.`,
                "Failed to save source."
              )
            }}
            disabled={actions.savingConfig}
          >
            {definition.sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {definition.sourceOptions.find((option) => option.value === sourceValue)?.hint}
          </p>
        </div>
      )}

      {showManualFields && secretField && (
        <div className="space-y-3">
          {definition.guidedCookieLogin && (
            <GuidedCookieLoginPanel
              buttonLabel={definition.guidedCookieLogin.buttonLabel}
              waiting={actions.guidedLoginOpen}
              disabled={actions.guidedLoginOpen || !actions.canSaveSecret}
              onStart={() => void actions.startGuidedLogin()}
            />
          )}
          {definition.browserCookieImport && (
            <BrowserCookieImportPanel
              providerId={providerId}
              description={definition.browserCookieImport.description}
              enabled={config?.browserCookieImportEnabled === true}
              secretKey={secretField.key}
              config={config}
              savingConfig={actions.savingConfig}
              onConfigChange={actions.onConfigChange}
              onEnabledChange={(next) =>
                void actions.saveConfig(
                  { browserCookieImportEnabled: next },
                  `${BROWSER_IMPORT_TITLE} ${next ? "turned on" : "turned off"}.`,
                  `Failed to update ${BROWSER_IMPORT_TITLE}.`
                )
              }
              onImported={onSignedIn}
              onFeedback={actions.showFeedback}
            />
          )}
          <ProviderSecretField
            inputId={`provider-secret-${providerId}`}
            resetKey={providerId}
            field={secretField}
            stateLabel="Secret state"
            stored={hasProviderSecret(config, secretField.key)}
            updatedAt={config?.secrets?.[secretField.key]?.updatedAt ?? null}
            storageNote="Secrets are stored by the app and are not shown again after saving."
            busy={actions.savingSecret}
            onSave={
              actions.canSaveSecret
                ? (value) => actions.saveSecret(secretField.key, value)
                : undefined
            }
            onDelete={
              actions.canDeleteSecret ? () => actions.deleteSecret(secretField.key) : undefined
            }
            onEmptySave={() =>
              actions.showFeedback({ error: `Enter the ${secretField.label} before saving.` })
            }
          />
        </div>
      )}

      {showManualFields && additionalSecret && (
        <ProviderSecretField
          inputId={`provider-secret-${providerId}-${additionalSecret.key}`}
          resetKey={providerId}
          field={additionalSecret}
          stateLabel={`${additionalSecret.label} state`}
          stored={hasProviderSecret(config, additionalSecret.key)}
          updatedAt={config?.secrets?.[additionalSecret.key]?.updatedAt ?? null}
          busy={actions.savingSecret}
          onSave={
            actions.canSaveSecret
              ? (value) => actions.saveSecret(additionalSecret.key, value)
              : undefined
          }
          onDelete={
            actions.canDeleteSecret ? () => actions.deleteSecret(additionalSecret.key) : undefined
          }
          onEmptySave={() =>
            actions.showFeedback({ error: `Enter the ${additionalSecret.label} before saving.` })
          }
        />
      )}
    </div>
  )
}
