import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  const accentStyle = useMemo(
    () => (plugin.brandColor ? { borderColor: `${plugin.brandColor}33` } : undefined),
    [plugin.brandColor]
  )
  const showManualFields = definition.mode === "editable" && sourceValue === "manual"
  const baseSetupHint = isConnected ? definition.statusHint : (definition.connectHint ?? definition.statusHint)
  const setupHint = plugin.supportState === "comingSoonOnWindows"
    ? plugin.supportMessage ?? "Coming soon on Windows."
    : plugin.supportState === "experimental" && plugin.supportMessage
      ? `${plugin.supportMessage} ${baseSetupHint}`
      : baseSetupHint
  const hasEditableSettings = Boolean(definition.sourceOptions || definition.secretField || definition.textField)

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
      setSaveMessage("Secret stored in the system credential vault.")
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
    <section
      className="flex flex-col rounded-[26px] border border-border/70 bg-card/95 p-5 shadow-[0_18px_45px_rgba(0,0,0,0.14)]"
      style={accentStyle}
      data-testid={`provider-settings-${plugin.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <ProviderIconMask iconUrl={plugin.iconUrl} brandColor={plugin.brandColor} />
          <div className="min-w-0">
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

        <div className="flex items-center gap-2">
          {onRetry && plugin.supportState !== "comingSoonOnWindows" && (
            <Button type="button" variant="outline" size="xs" onClick={onRetry} disabled={state?.loading}>
              <RefreshCw className={cn("size-3", state?.loading && "animate-spin")} />
              Retry
            </Button>
          )}
          <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5 text-sm">
            <span>Enabled</span>
            <Checkbox checked={enabled} disabled={plugin.supportState === "comingSoonOnWindows"} onCheckedChange={(checked) => onEnabledChange(checked === true)} />
          </label>
        </div>
      </div>

      <div className="mt-5 pr-1 text-sm">
        <div className="grid gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Source</div>
            <div className="mt-2 text-sm font-medium text-foreground">{getProviderSourceLabel(plugin.id, config)}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Last success</div>
            <div className="mt-2 text-sm font-medium text-foreground">{lastSuccessText ?? "No successful probe yet"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Secret state</div>
            <div className="mt-2 text-sm font-medium text-foreground">
              {secretPresent ? `Stored${secretUpdatedText ? ` · ${secretUpdatedText}` : ""}` : "No secret stored"}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-3">
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

        <div className="rounded-2xl bg-muted/40 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {isConnected ? "Connection details" : "How to connect"}
          </div>
          <p className="mt-1 text-muted-foreground">{setupHint}</p>
        </div>

        <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Settings</h4>

          <div className="mt-3 space-y-4">
            {definition.sourceOptions && (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Source
                </label>
                <select
                  aria-label={`${plugin.name} source`}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
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
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {definition.secretField.label}
                  </label>
                  <textarea
                    aria-label={`${plugin.name} ${definition.secretField.label}`}
                    className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
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
                    <Button type="button" variant="outline" size="xs" onClick={() => void handleSecretDelete()} disabled={isSavingSecret}>
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
                    className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
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

            {saveMessage && <p className="text-xs text-primary">{saveMessage}</p>}
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
          </div>
        </div>
        </div>
      </div>
    </section>
  )
}
