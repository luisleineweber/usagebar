import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, KeyRound, RefreshCw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PluginMeta } from "@/lib/plugin-types"
import type { ProviderConfig } from "@/lib/provider-settings"
import {
  getProviderSetupDefinition,
  getProviderSourceLabel,
  hasProviderSecret,
  type ProviderSourceMode,
} from "@/lib/provider-settings"
import type { PluginState } from "@/hooks/app/types"
import { cn } from "@/lib/utils"

export type ProviderSetupPanelProps = {
  plugin: PluginMeta
  config?: ProviderConfig
  state?: PluginState
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

function getProbeStatus(plugin: PluginMeta, state?: PluginState): { tone: string; label: string } {
  if (plugin.supportState === "comingSoonOnWindows") {
    return { tone: "muted", label: plugin.supportMessage ?? "Coming soon on Windows." }
  }
  if (state?.loading) return { tone: "info", label: "Refreshing provider status..." }
  if (state?.error) return { tone: "error", label: state.error }
  if (state?.data) return { tone: "success", label: "Provider responded successfully." }
  return { tone: "muted", label: "Provider has not completed a successful probe yet." }
}

export function ProviderSetupPanel({
  plugin,
  config,
  state,
  onRetry,
  onConfigChange,
  onSecretSave,
  onSecretDelete,
}: ProviderSetupPanelProps) {
  const definition = getProviderSetupDefinition(plugin.id)
  const probeStatus = getProbeStatus(plugin, state)
  const lastSuccessText = formatTimestamp(state?.lastSuccessAt ?? null)
  const secretKey = definition.secretField?.key
  const secretPresent = secretKey ? hasProviderSecret(config, secretKey) : false
  const secretUpdatedText = secretKey
    ? formatTimestamp(config?.secrets?.[secretKey]?.updatedAt ?? null)
    : null

  const [workspaceDraft, setWorkspaceDraft] = useState(config?.workspaceId ?? "")
  const [secretDraft, setSecretDraft] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingSecret, setIsSavingSecret] = useState(false)

  useEffect(() => {
    setWorkspaceDraft(config?.workspaceId ?? "")
  }, [config?.workspaceId])

  const sourceValue = (config?.source ?? "manual") as ProviderSourceMode
  const statusBadgeVariant = probeStatus.tone === "success"
      ? "default"
      : "outline"

  const accentStyle = useMemo(
    () => (plugin.brandColor ? { borderColor: `${plugin.brandColor}33` } : undefined),
    [plugin.brandColor]
  )

  const showManualFields = definition.mode === "editable" && sourceValue === "manual"

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
      setSaveError(error instanceof Error ? error.message : "Failed to save source.")
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
      setSaveMessage("Workspace override saved.")
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save workspace.")
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
      setSaveError(error instanceof Error ? error.message : "Failed to save secret.")
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
      setSaveError(error instanceof Error ? error.message : "Failed to clear secret.")
    } finally {
      setIsSavingSecret(false)
    }
  }

  return (
    <section
      className="rounded-xl border bg-card/80 p-3 shadow-sm backdrop-blur-sm"
      style={accentStyle}
      data-testid={`provider-setup-${plugin.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-[0.02em]">{definition.title}</h3>
            <Badge variant="outline">{getProviderSourceLabel(plugin.id, config)}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition.summary}</p>
        </div>
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
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
          {probeStatus.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-3.5 text-destructive" />
          ) : probeStatus.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 text-primary" />
          ) : (
            <ShieldCheck className="mt-0.5 size-3.5 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-foreground">Runtime status</div>
            <div className="text-muted-foreground">{probeStatus.label}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge
            variant={statusBadgeVariant}
            className={probeStatus.tone === "error" ? "border-destructive/40 text-destructive" : undefined}
          >
            {probeStatus.tone === "success" ? "Ready" : "Setup"}
          </Badge>
          {lastSuccessText && <Badge variant="outline">Last success {lastSuccessText}</Badge>}
          {secretPresent && secretUpdatedText && <Badge variant="outline">Secret saved {secretUpdatedText}</Badge>}
        </div>

        <p className="rounded-lg bg-muted/40 px-2.5 py-2 text-muted-foreground">
          {definition.statusHint}
        </p>
      </div>

      {definition.sourceOptions && (
        <div className="mt-4">
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
        <div className="mt-4 space-y-2">
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
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void handleSecretDelete()}
                disabled={isSavingSecret}
              >
                Clear secret
              </Button>
            )}
          </div>
        </div>
      )}

      {showManualFields && definition.textField && (
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {definition.textField.label}
          </label>
          <div className="flex gap-2">
            <input
              aria-label={`${plugin.name} ${definition.textField.label}`}
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary"
              placeholder={definition.textField.placeholder}
              value={workspaceDraft}
              onChange={(event) => setWorkspaceDraft(event.target.value)}
            />
            <Button type="button" variant="outline" size="xs" onClick={() => void handleWorkspaceSave()} disabled={isSavingConfig}>
              Save
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{definition.textField.description}</p>
        </div>
      )}

      {(saveError || saveMessage) && (
        <div className={cn(
          "mt-4 rounded-lg px-2.5 py-2 text-xs",
          saveError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}>
          {saveError ?? saveMessage}
        </div>
      )}
    </section>
  )
}
