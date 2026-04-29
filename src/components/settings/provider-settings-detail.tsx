import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CodexAccountsSection } from "@/components/settings/codex-accounts-section"
import type { PluginState } from "@/hooks/app/types"
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

function getProbeStatus(plugin: PluginMeta, state?: PluginState): { tone: "muted" | "info" | "error" | "success"; label: string } {
  if (plugin.supportState === "comingSoonOnWindows") {
    return { tone: "muted", label: plugin.supportMessage ?? "Coming soon on Windows." }
  }
  if (state?.loading) return { tone: "info", label: "Refreshing provider status..." }
  if (state?.error) return { tone: "error", label: state.error }
  if (state?.data) return { tone: "success", label: "Provider responded successfully." }
  return { tone: "muted", label: "Provider has not completed a successful probe yet." }
}

function ProviderIconMask({ iconUrl, brandColor }: { iconUrl: string; brandColor?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-8 shrink-0 rounded-lg bg-foreground/85"
      style={{
        backgroundColor: brandColor ?? "currentColor",
        WebkitMaskImage: `url(${iconUrl})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${iconUrl})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  )
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
  const probeStatus = getProbeStatus(plugin, state)
  const isConnected = Boolean(state?.data)
  const lastSuccessText = formatTimestamp(state?.lastSuccessAt ?? null)
  const secretKey = definition.secretField?.key
  const secretPresent = secretKey ? hasProviderSecret(config, secretKey) : false
  const secretUpdatedText = secretKey ? formatTimestamp(config?.secrets?.[secretKey]?.updatedAt ?? null) : null

  const [workspaceDraft, setWorkspaceDraft] = useState(config?.workspaceId ?? "")
  const [secretDraft, setSecretDraft] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingSecret, setIsSavingSecret] = useState(false)

  useEffect(() => {
    setWorkspaceDraft(config?.workspaceId ?? "")
  }, [config?.workspaceId, plugin.id])

  useEffect(() => {
    setSecretDraft("")
    setSaveError(null)
    setSaveMessage(null)
  }, [plugin.id])

  const sourceValue = (config?.source ?? "manual") as ProviderSourceMode
  const statusBadgeVariant = probeStatus.tone === "success" ? "default" : "outline"
  const accentStyle = useMemo(() => (plugin.brandColor ? { color: plugin.brandColor } : undefined), [plugin.brandColor])
  const showManualFields = definition.mode === "editable" && sourceValue === "manual"
  const baseSetupHint = isConnected ? definition.statusHint : (definition.connectHint ?? definition.statusHint)
  const setupHint = plugin.supportState === "comingSoonOnWindows"
    ? plugin.supportMessage ?? "Coming soon on Windows."
    : plugin.supportState === "experimental" && plugin.supportMessage
      ? `${plugin.supportMessage} ${baseSetupHint}`
      : baseSetupHint
  const hasEditableSettings = Boolean(definition.sourceOptions || definition.secretField || definition.textField)
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
      await onConfigChange(plugin.id, { workspaceId: workspaceDraft.trim() || undefined })
      setSaveMessage("Workspace override saved.")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Failed to save workspace."))
    } finally {
      setIsSavingConfig(false)
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

  return (
    <section className="flex flex-col" style={accentStyle} data-testid={`provider-settings-${plugin.id}`}>
      {/* Provider header */}
      <div className="border-b border-border/60 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderIconMask iconUrl={plugin.iconUrl} brandColor={plugin.brandColor} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Provider configuration
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold tracking-[0.01em]">{plugin.name}</h3>
              <Badge
                variant={statusBadgeVariant}
                className={probeStatus.tone === "error" ? "border-destructive/40 text-destructive" : undefined}
              >
                {probeStatus.tone === "success" ? "Ready" : "Setup"}
              </Badge>
              {plugin.supportState === "experimental" && <Badge variant="outline">Experimental</Badge>}
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
            <Button type="button" variant="outline" size="xs" onClick={onRetry} disabled={state?.loading}>
              <RefreshCw className={cn("size-3", state?.loading && "animate-spin")} />
              Retry
            </Button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Enabled</span>
            <Checkbox checked={enabled} disabled={plugin.supportState === "comingSoonOnWindows"} onCheckedChange={(checked) => onEnabledChange(checked === true)} />
          </label>
        </div>
      </div>

      <div className="mt-5 pr-1 text-sm">
        <div className={groupClass}>
          <h4 className={groupTitleClass}>Status</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Source</div>
              <div className="mt-2 text-sm font-medium text-foreground">{getProviderSourceLabel(plugin.id, config)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Last success</div>
              <div className="mt-2 text-sm font-medium text-foreground">{lastSuccessText ?? "No successful probe yet"}</div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-border/55 bg-muted/25 px-3 py-3">
            {probeStatus.tone === "error" ? (
              <AlertCircle className="mt-0.5 size-4 text-destructive" />
            ) : probeStatus.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 text-primary" />
            ) : (
              <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-foreground">Runtime status</div>
              <div className="text-muted-foreground">{probeStatus.label}</div>
            </div>
          </div>
        </div>

        <div className={groupClass}>
          <h4 className={groupTitleClass}>{isConnected ? "Connection details" : "How to connect"}</h4>
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
                <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Secret state</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {secretPresent ? `Stored${secretUpdatedText ? ` / ${secretUpdatedText}` : ""}` : "No secret stored"}
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
                    aria-label={`${plugin.name} ${definition.secretField.label}`}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
                    placeholder={definition.secretField.placeholder}
                    value={secretDraft}
                    onChange={(event) => setSecretDraft(event.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{definition.secretField.description}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" onClick={() => void handleSecretSave()} disabled={isSavingSecret}>
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
                      disabled={isSavingSecret}
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
                  <Button type="button" size="xs" onClick={() => void handleWorkspaceSave()} disabled={isSavingConfig}>
                    Save
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{definition.textField.description}</p>
              </div>
            )}

            {!hasEditableSettings && (
              <p className="text-sm text-muted-foreground">This provider currently relies on local auto-detection and does not expose editable settings yet.</p>
            )}

            {plugin.id === "codex" && (
              <CodexAccountsSection config={config} onConfigChange={onConfigChange} />
            )}

            {saveMessage && <p className="text-xs text-primary">{saveMessage}</p>}
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
