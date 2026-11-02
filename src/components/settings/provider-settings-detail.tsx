import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AccountManagementSection } from "@/components/settings/account-management-section"
import {
  BrowserCookieImportPanel,
  BROWSER_IMPORT_TITLE,
  type SettingsFeedback,
} from "@/components/settings/browser-cookie-import-panel"
import { GuidedCookieLoginPanel } from "@/components/settings/guided-cookie-login-panel"
import {
  ProviderRuntimeStatus,
  getProbeStatus,
  getUnsupportedMessage,
} from "@/components/settings/provider-runtime-status"
import { ProviderSecretField } from "@/components/settings/provider-secret-field"
import { ProviderSettingsHeader } from "@/components/settings/provider-settings-header"
import { ReportingSourceSettings } from "@/components/settings/reporting-source-settings"
import { SetupAssistant } from "@/components/settings/setup-assistant"
import type { PluginState } from "@/hooks/app/types"
import { captureProviderCookieHeader } from "@/lib/guided-cookie-login"
import { getErrorMessage } from "@/lib/error-utils"
import type { PluginMeta } from "@/lib/plugin-types"
import { getProviderConnectionState } from "@/lib/provider-connection-state"
import {
  getProviderSettingsDefinition,
  getProviderSourceLabel,
  hasProviderSecret,
  hasProviderSettingsDefinition,
  type ProviderConfig,
  type ProviderSourceMode,
} from "@/lib/provider-settings"

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

const STALE_AFTER_MS = 30 * 60_000
// One section rhythm: every top-level group owns a divider and 16px above and below.
// The first group follows the header divider, so it drops its own divider.
const GROUP_CLASS = "border-t border-border/55 py-4 first:border-t-0 first:pt-0"
const GROUP_TITLE_CLASS = "text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"
const FIELD_LABEL_CLASS =
  "mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"

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
  const connectionState = getProviderConnectionState({
    enabled,
    supported: plugin.supportState !== "comingSoonOnWindows",
    state: {
      data: state?.data ?? null,
      error: state?.error ?? null,
      loading: state?.loading ?? false,
      lastSettledError: state?.lastSettledError ?? null,
    },
  })
  const probeStatus = getProbeStatus(plugin, connectionState, state)
  const isConnected = connectionState === "connected"
  const secretField = definition.secretField
  const secretPresent = secretField ? hasProviderSecret(config, secretField.key) : false
  const additionalSecret = definition.additionalSecretField
  const [workspaceDraft, setWorkspaceDraft] = useState(config?.workspaceId ?? "")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingSecret, setIsSavingSecret] = useState(false)
  const [isGuidedLoginOpen, setIsGuidedLoginOpen] = useState(false)

  useEffect(() => {
    setWorkspaceDraft(config?.workspaceId ?? "")
  }, [config?.workspaceId, plugin.id])

  useEffect(() => {
    setSaveError(null)
    setSaveMessage(null)
  }, [plugin.id])

  const showFeedback = useCallback((feedback: SettingsFeedback | null) => {
    setSaveMessage(feedback && "message" in feedback ? feedback.message : null)
    setSaveError(feedback && "error" in feedback ? feedback.error : null)
  }, [])

  const sourceValue = (config?.source ?? "manual") as ProviderSourceMode
  const showManualFields = definition.mode === "editable" && sourceValue === "manual"
  // The Experimental badge already names the support state. A provider's own hint is the
  // specific guidance; the manifest message is used only when no settings definition exists.
  const setupHint =
    connectionState === "unsupported"
      ? getUnsupportedMessage(plugin)
      : !hasProviderSettingsDefinition(plugin.id) && plugin.supportMessage
        ? plugin.supportMessage
        : isConnected
          ? definition.statusHint
          : (definition.connectHint ?? definition.statusHint)
  const hasEditableSettings = Boolean(
    definition.sourceOptions ||
    definition.secretField ||
    definition.additionalSecretField ||
    definition.textField
  )

  const saveConfig = async (
    patch: Partial<ProviderConfig>,
    successMessage: string,
    fallbackError: string
  ) => {
    if (!onConfigChange) return
    showFeedback(null)
    setIsSavingConfig(true)
    try {
      await onConfigChange(plugin.id, patch)
      showFeedback({ message: successMessage })
    } catch (error) {
      showFeedback({ error: getErrorMessage(error, fallbackError) })
    } finally {
      setIsSavingConfig(false)
    }
  }

  const saveSecret = async (key: string, value: string): Promise<boolean> => {
    if (!onSecretSave) return false
    showFeedback(null)
    setIsSavingSecret(true)
    try {
      await onSecretSave(plugin.id, key, value)
      showFeedback({ message: "Secret stored securely for this app." })
      return true
    } catch (error) {
      showFeedback({ error: getErrorMessage(error, "Failed to save secret.") })
      return false
    } finally {
      setIsSavingSecret(false)
    }
  }

  const deleteSecret = async (key: string): Promise<boolean> => {
    if (!onSecretDelete) return false
    showFeedback(null)
    setIsSavingSecret(true)
    try {
      await onSecretDelete(plugin.id, key)
      showFeedback({ message: "Stored secret removed." })
      return true
    } catch (error) {
      showFeedback({ error: getErrorMessage(error, "Failed to clear secret.") })
      return false
    } finally {
      setIsSavingSecret(false)
    }
  }

  const handleGuidedCookieLogin = async () => {
    const login = definition.guidedCookieLogin
    if (!login || !onSecretSave) return
    showFeedback(null)
    setIsGuidedLoginOpen(true)
    try {
      const result = await captureProviderCookieHeader({
        providerId: plugin.id,
        windowTitle: login.windowTitle,
        loginUrl: login.loginUrl,
        successUrlContains: login.successUrlContains,
        cookieUrls: login.cookieUrls,
      })
      await onSecretSave(plugin.id, login.secretKey, result.cookieHeader)
      showFeedback({ message: login.successMessage })
    } catch (error) {
      showFeedback({ error: getErrorMessage(error, "Guided login failed.") })
    } finally {
      setIsGuidedLoginOpen(false)
    }
  }

  const sourceSelectId = `provider-source-${plugin.id}`
  const textFieldId = `provider-text-${plugin.id}`

  return (
    <section className="flex flex-col" data-testid={`provider-settings-${plugin.id}`}>
      <ProviderSettingsHeader
        plugin={plugin}
        summary={definition.summary}
        enabled={enabled}
        connectionState={connectionState}
        loading={Boolean(state?.loading)}
        onEnabledChange={onEnabledChange}
        onCheck={onRetry}
        onOpenInTray={onOpenInTray}
      />

      <div className="mt-4 pr-1 text-sm">
        <ProviderRuntimeStatus
          className={GROUP_CLASS}
          sourceLabel={getProviderSourceLabel(plugin.id, config)}
          lastSuccessAt={state?.lastSuccessAt ?? null}
          status={probeStatus}
        />

        {definition.setupChecks?.length ? (
          <SetupAssistant
            checks={definition.setupChecks}
            detections={state?.setupDetection}
            loading={Boolean(state?.loading)}
          />
        ) : null}

        <div className={GROUP_CLASS}>
          <h4 className={GROUP_TITLE_CLASS}>
            {isConnected ? "Connection details" : "How to connect"}
          </h4>
          <p className="mt-2 text-muted-foreground">{setupHint}</p>
        </div>

        {hasEditableSettings ? (
          <div className={GROUP_CLASS}>
            <h4 className={GROUP_TITLE_CLASS}>Provider Settings</h4>

            <div className="mt-3 space-y-4">
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
                      void saveConfig(
                        { source: next },
                        `Source set to ${next === "manual" ? "Manual" : "Automatic"}.`,
                        "Failed to save source."
                      )
                    }}
                    disabled={isSavingConfig}
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
                  {definition.browserCookieImport && (
                    <BrowserCookieImportPanel
                      providerId={plugin.id}
                      description={definition.browserCookieImport.description}
                      enabled={config?.browserCookieImportEnabled === true}
                      secretKey={secretField.key}
                      config={config}
                      savingConfig={isSavingConfig}
                      onConfigChange={onConfigChange}
                      onEnabledChange={(next) =>
                        void saveConfig(
                          { browserCookieImportEnabled: next },
                          `${BROWSER_IMPORT_TITLE} ${next ? "turned on" : "turned off"}.`,
                          `Failed to update ${BROWSER_IMPORT_TITLE}.`
                        )
                      }
                      onImported={onRetry}
                      onFeedback={showFeedback}
                    />
                  )}
                  {definition.guidedCookieLogin && (
                    <GuidedCookieLoginPanel
                      buttonLabel={definition.guidedCookieLogin.buttonLabel}
                      waiting={isGuidedLoginOpen}
                      disabled={isGuidedLoginOpen || !onSecretSave}
                      onStart={() => void handleGuidedCookieLogin()}
                    />
                  )}
                  <ProviderSecretField
                    inputId={`provider-secret-${plugin.id}`}
                    resetKey={plugin.id}
                    field={secretField}
                    stateLabel="Secret state"
                    stored={secretPresent}
                    updatedAt={config?.secrets?.[secretField.key]?.updatedAt ?? null}
                    storageNote="Secrets are stored by the app and are not shown again after saving."
                    busy={isSavingSecret}
                    onSave={
                      onSecretSave ? (value) => saveSecret(secretField.key, value) : undefined
                    }
                    onDelete={onSecretDelete ? () => deleteSecret(secretField.key) : undefined}
                    onEmptySave={() =>
                      showFeedback({ error: `Enter the ${secretField.label} before saving.` })
                    }
                  />
                </div>
              )}

              {showManualFields && additionalSecret && (
                <ProviderSecretField
                  inputId={`provider-secret-${plugin.id}-${additionalSecret.key}`}
                  resetKey={plugin.id}
                  field={additionalSecret}
                  stateLabel={`${additionalSecret.label} state`}
                  stored={hasProviderSecret(config, additionalSecret.key)}
                  updatedAt={config?.secrets?.[additionalSecret.key]?.updatedAt ?? null}
                  busy={isSavingSecret}
                  onSave={
                    onSecretSave ? (value) => saveSecret(additionalSecret.key, value) : undefined
                  }
                  onDelete={onSecretDelete ? () => deleteSecret(additionalSecret.key) : undefined}
                  onEmptySave={() =>
                    showFeedback({ error: `Enter the ${additionalSecret.label} before saving.` })
                  }
                />
              )}

              {showManualFields && definition.textField && (
                <div>
                  <label htmlFor={textFieldId} className={FIELD_LABEL_CLASS}>
                    {definition.textField.label}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={textFieldId}
                      aria-describedby={`${textFieldId}-description`}
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                      placeholder={definition.textField.placeholder}
                      value={workspaceDraft}
                      onChange={(event) => setWorkspaceDraft(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="default"
                      onClick={() =>
                        void saveConfig(
                          { workspaceId: workspaceDraft.trim() || undefined },
                          `${definition.textField?.label} saved.`,
                          "Failed to save workspace."
                        )
                      }
                      disabled={isSavingConfig}
                    >
                      Save
                    </Button>
                  </div>
                  <p
                    id={`${textFieldId}-description`}
                    className="mt-1 text-xs text-muted-foreground"
                  >
                    {definition.textField.description}
                  </p>
                </div>
              )}

              {saveMessage && (
                <p role="status" className="text-xs text-primary">
                  {saveMessage}
                </p>
              )}
              {saveError && (
                <p role="alert" className="text-xs text-destructive">
                  {saveError}
                </p>
              )}
            </div>
          </div>
        ) : null}

        <AccountManagementSection
          providerId={plugin.id}
          providerName={plugin.name}
          definition={definition}
          connectionState={connectionState}
          unsupportedMessage={getUnsupportedMessage(plugin)}
          stale={Boolean(
            isConnected && state?.lastSuccessAt && Date.now() - state.lastSuccessAt > STALE_AFTER_MS
          )}
          config={config}
          credentialStored={secretPresent}
          onConfigChange={onConfigChange}
          onReauthenticate={() => {
            if (definition.guidedCookieLogin) {
              void handleGuidedCookieLogin()
              return
            }
            document.getElementById(`provider-secret-${plugin.id}`)?.focus()
          }}
          onRemoveCredential={() => {
            if (secretField) void deleteSecret(secretField.key)
          }}
        />

        {(plugin.id === "claude" || plugin.id === "codex") && (
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
