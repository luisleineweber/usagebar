import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProviderIcon } from "@/components/provider-icon"
import { Checkbox } from "@/components/ui/checkbox"
import { useDarkMode } from "@/hooks/use-dark-mode"
import { AccountManagementSection } from "@/components/settings/account-management-section"
import { ReportingSourceSettings } from "@/components/settings/reporting-source-settings"
import type { PluginState } from "@/hooks/app/types"
import { captureProviderCookieHeader } from "@/lib/guided-cookie-login"
import {
  browserImportMessage,
  importBrowserCookies,
  listBrowserImportSources,
  type BrowserImportSource,
} from "@/lib/browser-cookie-import"
import type { PluginMeta } from "@/lib/plugin-types"
import type { ProviderConfig } from "@/lib/provider-settings"
import { getErrorMessage } from "@/lib/error-utils"
import {
  getProviderSettingsDefinition,
  getProviderSourceLabel,
  hasProviderSecret,
  type ProviderSourceMode,
} from "@/lib/provider-settings"
import { cn } from "@/lib/utils"

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

function formatTimestamp(timestamp: number | null | undefined): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)
}

function getProbeStatus(
  plugin: PluginMeta,
  state: PluginState | undefined,
  enabled: boolean
): { tone: "muted" | "info" | "error" | "success"; label: string } {
  if (plugin.supportState === "comingSoonOnWindows") {
    return {
      tone: "muted",
      label: plugin.supportMessage ?? "Coming soon on Windows.",
    }
  }
  if (state?.loading) return { tone: "info", label: "Refreshing provider status..." }
  if (state?.error) return { tone: "error", label: state.error }
  if (state?.data) return { tone: "success", label: "Provider responded successfully." }
  // No probe has run yet — give an actionable hint.
  if (!enabled)
    return {
      tone: "muted",
      label: "Enable this provider, then click Retry to run the first check.",
    }
  return {
    tone: "muted",
    label: "Click Retry to run the first check for this provider.",
  }
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
  const isDark = useDarkMode()
  const definition = getProviderSettingsDefinition(plugin.id)
  const probeStatus = getProbeStatus(plugin, state, enabled)
  const isConnected = Boolean(state?.data)
  const lastSuccessText = formatTimestamp(state?.lastSuccessAt ?? null)
  const secretKey = definition.secretField?.key
  const secretPresent = secretKey ? hasProviderSecret(config, secretKey) : false
  const secretUpdatedText = secretKey
    ? formatTimestamp(config?.secrets?.[secretKey]?.updatedAt ?? null)
    : null
  const additionalSecret = definition.additionalSecretField
  const additionalSecretPresent = additionalSecret
    ? hasProviderSecret(config, additionalSecret.key)
    : false
  const additionalSecretUpdatedText = additionalSecret
    ? formatTimestamp(config?.secrets?.[additionalSecret.key]?.updatedAt ?? null)
    : null
  const [workspaceDraft, setWorkspaceDraft] = useState(config?.workspaceId ?? "")
  const [secretDraft, setSecretDraft] = useState("")
  const [additionalSecretDraft, setAdditionalSecretDraft] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingSecret, setIsSavingSecret] = useState(false)
  const [isGuidedLoginOpen, setIsGuidedLoginOpen] = useState(false)
  const [browserSources, setBrowserSources] = useState<BrowserImportSource[]>([])
  const [browserSourceId, setBrowserSourceId] = useState("edge")
  const [browserProfileId, setBrowserProfileId] = useState("")
  const [isImportingBrowser, setIsImportingBrowser] = useState(false)

  useEffect(() => {
    setWorkspaceDraft(config?.workspaceId ?? "")
  }, [config?.workspaceId, plugin.id])

  useEffect(() => {
    setSecretDraft("")
    setAdditionalSecretDraft("")
    setSaveError(null)
    setSaveMessage(null)
  }, [plugin.id])

  useEffect(() => {
    if (!definition.browserCookieImport || !config?.browserCookieImportEnabled) {
      setBrowserSources([])
      setBrowserProfileId("")
      return
    }
    let cancelled = false
    void listBrowserImportSources(plugin.id)
      .then((sources) => {
        if (cancelled) return
        setBrowserSources(sources)
        const source = sources[0]
        setBrowserSourceId(source?.sourceId ?? "edge")
        setBrowserProfileId(source?.profiles[0] ?? "")
      })
      .catch((error) => {
        if (!cancelled) setSaveError(getErrorMessage(error, "Failed to inspect Edge profiles."))
      })
    return () => {
      cancelled = true
    }
  }, [config?.browserCookieImportEnabled, definition.browserCookieImport, plugin.id])

  const sourceValue = (config?.source ?? "manual") as ProviderSourceMode
  const statusBadgeVariant = probeStatus.tone === "success" ? "default" : "outline"
  const showManualFields = definition.mode === "editable" && sourceValue === "manual"
  const baseSetupHint = isConnected
    ? definition.statusHint
    : (definition.connectHint ?? definition.statusHint)
  const setupHint =
    plugin.supportState === "comingSoonOnWindows"
      ? (plugin.supportMessage ?? "Coming soon on Windows.")
      : plugin.supportState === "experimental" && plugin.supportMessage
        ? `${plugin.supportMessage} ${baseSetupHint}`
        : baseSetupHint
  const hasEditableSettings = Boolean(
    definition.sourceOptions ||
    definition.secretField ||
    definition.additionalSecretField ||
    definition.textField
  )
  const groupClass = "border-t border-border/55 py-4"
  const groupTitleClass = "text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"

  const handleSourceChange = async (value: string) => {
    if (!onConfigChange) return
    const nextSource = value === "auto" ? "auto" : "manual"
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingConfig(true)
    try {
      await onConfigChange(plugin.id, { source: nextSource })
      setSaveMessage(`Source set to ${nextSource === "manual" ? "Manual" : "Automatic"}.`)
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to save source."))
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleWorkspaceSave = async () => {
    if (!definition.textField || !onConfigChange) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingConfig(true)
    try {
      await onConfigChange(plugin.id, {
        workspaceId: workspaceDraft.trim() || undefined,
      })
      setSaveMessage(`${definition.textField.label} saved.`)
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to save workspace."))
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleBrowserImportEnabledChange = async (enabled: boolean) => {
    if (!onConfigChange) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingConfig(true)
    try {
      await onConfigChange(plugin.id, { browserCookieImportEnabled: enabled })
      setSaveMessage(
        enabled ? "Browser import enabled for this provider." : "Browser import disabled."
      )
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to update browser import permission."))
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleBrowserImport = async () => {
    if (!browserProfileId || !onConfigChange) return
    setSaveError(null)
    setSaveMessage(null)
    setIsImportingBrowser(true)
    try {
      const result = await importBrowserCookies(plugin.id, browserSourceId, browserProfileId)
      const message = browserImportMessage(result)
      if (result.code !== "ok") {
        setSaveError(message)
        return
      }
      const key = definition.secretField?.key ?? "cookieHeader"
      await onConfigChange(plugin.id, {
        secrets: {
          ...(config?.secrets ?? {}),
          [key]: { updatedAt: Date.now() },
        },
      })
      setSaveMessage(message)
      onRetry?.()
    } catch (error) {
      setSaveError(getErrorMessage(error, "Browser import failed."))
    } finally {
      setIsImportingBrowser(false)
    }
  }

  const handleSecretSave = async () => {
    if (!definition.secretField || !onSecretSave) return
    const trimmed = secretDraft.trim()
    if (!trimmed) {
      setSaveError("Paste a cookie header before saving.")
      setSaveMessage(null)
      return
    }
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingSecret(true)
    try {
      await onSecretSave(plugin.id, definition.secretField.key, trimmed)
      setSecretDraft("")
      setSaveMessage("Secret stored securely for this app.")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to save secret."))
    } finally {
      setIsSavingSecret(false)
    }
  }

  const handleSecretDelete = async () => {
    if (!definition.secretField || !onSecretDelete) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingSecret(true)
    try {
      await onSecretDelete(plugin.id, definition.secretField.key)
      setSecretDraft("")
      setSaveMessage("Stored secret removed.")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to clear secret."))
    } finally {
      setIsSavingSecret(false)
    }
  }

  const handleAdditionalSecretSave = async () => {
    if (!additionalSecret || !onSecretSave) return
    const trimmed = additionalSecretDraft.trim()
    if (!trimmed) {
      setSaveError("Paste a secret before saving.")
      setSaveMessage(null)
      return
    }
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingSecret(true)
    try {
      await onSecretSave(plugin.id, additionalSecret.key, trimmed)
      setAdditionalSecretDraft("")
      setSaveMessage("Secret stored securely for this app.")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to save secret."))
    } finally {
      setIsSavingSecret(false)
    }
  }

  const handleAdditionalSecretDelete = async () => {
    if (!additionalSecret || !onSecretDelete) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSavingSecret(true)
    try {
      await onSecretDelete(plugin.id, additionalSecret.key)
      setAdditionalSecretDraft("")
      setSaveMessage("Stored secret removed.")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to clear secret."))
    } finally {
      setIsSavingSecret(false)
    }
  }

  const handleGuidedCookieLogin = async () => {
    const login = definition.guidedCookieLogin
    if (!login || !onSecretSave) return

    setSaveError(null)
    setSaveMessage(null)
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
      setSecretDraft("")
      setSaveMessage(login.successMessage)
    } catch (error) {
      setSaveError(getErrorMessage(error, "Guided login failed."))
    } finally {
      setIsGuidedLoginOpen(false)
    }
  }

  return (
    <section className="flex flex-col" data-testid={`provider-settings-${plugin.id}`}>
      {/* Provider header */}
      <div className="border-b border-border/60 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderIcon
            iconUrl={plugin.iconUrl}
            darkIconUrl={plugin.darkIconUrl}
            iconColorMode={plugin.iconColorMode}
            brandColor={plugin.brandColor}
            isDark={isDark}
            className="size-8"
            ariaHidden
            testId="provider-icon"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Provider configuration
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold tracking-[0.01em] text-foreground">
                {plugin.name}
              </h3>
              <Badge
                variant={statusBadgeVariant}
                className={
                  probeStatus.tone === "error"
                    ? "border-destructive/40 text-destructive"
                    : undefined
                }
              >
                {probeStatus.tone === "success" ? "Ready" : "Setup"}
              </Badge>
              {plugin.supportState === "experimental" && (
                <Badge variant="outline">Experimental</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{definition.summary}</p>
          </div>
        </div>

        {/* Action row separated from title to avoid cramped flex-wrap */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onOpenInTray && (
            <Button type="button" variant="outline" size="xs" onClick={onOpenInTray}>
              Open in tray
            </Button>
          )}
          {onRetry && plugin.supportState !== "comingSoonOnWindows" && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onRetry}
              disabled={state?.loading}
            >
              <RefreshCw className={cn("size-3", state?.loading && "animate-spin")} />
              Retry
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Enabled</span>
            <Checkbox
              checked={enabled}
              disabled={plugin.supportState === "comingSoonOnWindows"}
              onCheckedChange={(checked) => onEnabledChange(checked === true)}
            />
          </label>
        </div>
      </div>

      <div className="mt-5 pr-1 text-sm">
        <div className={groupClass}>
          <h4 className={groupTitleClass}>Status</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Source
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {getProviderSourceLabel(plugin.id, config)}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Last success
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {lastSuccessText ?? "No successful probe yet"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-border/55 bg-muted/25 px-3 py-3">
            {probeStatus.tone === "error" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : probeStatus.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">Runtime status</div>
              <div className="select-text break-words text-muted-foreground">
                {probeStatus.label}
              </div>
            </div>
            {/* Copy-to-clipboard button for error messages — helps users paste into bug reports. */}
            {probeStatus.tone === "error" && (
              <button
                type="button"
                aria-label="Copy error to clipboard"
                className="ml-auto mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  navigator.clipboard.writeText(probeStatus.label).catch(console.error)
                }}
              >
                <ClipboardCopy className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className={groupClass}>
          <h4 className={groupTitleClass}>
            {isConnected ? "Connection details" : "How to connect"}
          </h4>
          <p className="mt-2 text-muted-foreground">{setupHint}</p>
        </div>

        <div className={groupClass}>
          <h4 className={groupTitleClass}>Provider Settings</h4>

          <div className="mt-3 space-y-4">
            {definition.sourceOptions && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Source
                </label>
                <select
                  aria-label={`${plugin.name} source`}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                  value={sourceValue}
                  onChange={(event) => void handleSourceChange(event.target.value)}
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

            {showManualFields && definition.secretField && (
              <div className="space-y-3">
                {definition.browserCookieImport && (
                  <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Microsoft Edge import
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {definition.browserCookieImport.description}
                        </p>
                      </div>
                      <Checkbox
                        aria-label={`Enable ${plugin.name} browser import`}
                        checked={config?.browserCookieImportEnabled === true}
                        onCheckedChange={(checked) =>
                          void handleBrowserImportEnabledChange(checked === true)
                        }
                        disabled={isSavingConfig}
                      />
                    </div>
                    {config?.browserCookieImportEnabled ? (
                      browserSources.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <select
                            aria-label={`${plugin.name} Edge profile`}
                            value={browserProfileId}
                            onChange={(event) => setBrowserProfileId(event.target.value)}
                            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                          >
                            {browserSources
                              .flatMap((source) =>
                                source.profiles.map((profile) => ({
                                  sourceId: source.sourceId,
                                  profile,
                                }))
                              )
                              .map((option) => (
                                <option
                                  key={`${option.sourceId}-${option.profile}`}
                                  value={option.profile}
                                >
                                  {option.profile}
                                </option>
                              ))}
                          </select>
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => void handleBrowserImport()}
                            disabled={isImportingBrowser || !browserProfileId}
                          >
                            <ShieldCheck className="size-3" />
                            {isImportingBrowser ? "Importing..." : "Import session"}
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No Edge profile with a cookie database was found. Manual entry remains
                          available below.
                        </p>
                      )
                    ) : null}
                  </div>
                )}
                {definition.guidedCookieLogin && (
                  <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Guided login
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Opens a provider login window and stores only the captured Cookie header after
                      the target usage page loads.
                    </p>
                    <Button
                      type="button"
                      size="xs"
                      className="mt-3"
                      onClick={() => void handleGuidedCookieLogin()}
                      disabled={isGuidedLoginOpen || !onSecretSave}
                    >
                      <ExternalLink className="size-3" />
                      {isGuidedLoginOpen
                        ? "Waiting for login..."
                        : definition.guidedCookieLogin.buttonLabel}
                    </Button>
                  </div>
                )}
                <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Secret state
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {secretPresent
                      ? `Stored${secretUpdatedText ? ` / ${secretUpdatedText}` : ""}`
                      : "No secret stored"}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Secrets are stored by the app and are not shown again after saving.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {definition.secretField.label}
                  </label>
                  <textarea
                    id={`provider-secret-${plugin.id}`}
                    aria-label={`${plugin.name} ${definition.secretField.label}`}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                    placeholder={definition.secretField.placeholder}
                    value={secretDraft}
                    onChange={(event) => setSecretDraft(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {definition.secretField.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => void handleSecretSave()}
                    disabled={isSavingSecret || !onSecretSave}
                  >
                    <KeyRound className="size-3" />
                    {secretPresent ? "Replace secret" : "Save secret"}
                  </Button>
                  {secretPresent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleSecretDelete()}
                      disabled={isSavingSecret || !onSecretDelete}
                    >
                      <Trash2 className="size-3" />
                      Clear secret
                    </Button>
                  )}
                </div>
              </div>
            )}

            {showManualFields && additionalSecret && (
              <div className="space-y-3">
                <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {additionalSecret.label} state
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {additionalSecretPresent
                      ? `Stored${additionalSecretUpdatedText ? ` / ${additionalSecretUpdatedText}` : ""}`
                      : "No secret stored"}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {additionalSecret.label}
                  </label>
                  <textarea
                    id={`provider-secret-${plugin.id}-${additionalSecret.key}`}
                    aria-label={`${plugin.name} ${additionalSecret.label}`}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                    placeholder={additionalSecret.placeholder}
                    value={additionalSecretDraft}
                    onChange={(event) => setAdditionalSecretDraft(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {additionalSecret.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => void handleAdditionalSecretSave()}
                    disabled={isSavingSecret || !onSecretSave}
                  >
                    <KeyRound className="size-3" />
                    {additionalSecretPresent ? "Replace secret" : "Save secret"}
                  </Button>
                  {additionalSecretPresent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleAdditionalSecretDelete()}
                      disabled={isSavingSecret || !onSecretDelete}
                    >
                      <Trash2 className="size-3" />
                      Clear secret
                    </Button>
                  )}
                </div>
              </div>
            )}

            {showManualFields && definition.textField && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {definition.textField.label}
                </label>
                <div className="flex gap-2">
                  <input
                    aria-label={`${plugin.name} ${definition.textField.label}`}
                    className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                    placeholder={definition.textField.placeholder}
                    value={workspaceDraft}
                    onChange={(event) => setWorkspaceDraft(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => void handleWorkspaceSave()}
                    disabled={isSavingConfig}
                  >
                    Save
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {definition.textField.description}
                </p>
              </div>
            )}

            {!hasEditableSettings && (
              <p className="text-sm text-muted-foreground">
                This provider currently relies on local auto-detection and does not expose editable
                settings yet.
              </p>
            )}

            <AccountManagementSection
              providerId={plugin.id}
              definition={definition}
              connected={isConnected}
              stale={Boolean(
                state?.lastSuccessAt && Date.now() - state.lastSuccessAt > 30 * 60_000
              )}
              config={config}
              credentialStored={secretPresent}
              onConfigChange={onConfigChange}
              onPing={() => onRetry?.()}
              onReauthenticate={() => {
                if (definition.guidedCookieLogin) {
                  void handleGuidedCookieLogin()
                  return
                }
                document.getElementById(`provider-secret-${plugin.id}`)?.focus()
              }}
              onRemoveCredential={() => void handleSecretDelete()}
            />

            {(plugin.id === "claude" || plugin.id === "codex") && (
              <ReportingSourceSettings
                providerId={plugin.id}
                config={config}
                onConfigChange={onConfigChange}
              />
            )}

            {saveMessage && <p className="text-xs text-primary">{saveMessage}</p>}
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
