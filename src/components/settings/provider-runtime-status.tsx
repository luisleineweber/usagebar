import { AlertCircle, CheckCircle2, ClipboardCopy, ShieldCheck } from "lucide-react"
import type { PluginState } from "@/hooks/app/types"
import type { ProviderConnectionState } from "@/lib/provider-connection-state"
import type { PluginMeta } from "@/lib/plugin-types"

type ProbeStatus = { tone: "muted" | "info" | "error" | "success"; label: string }

export function getProbeStatus(
  plugin: PluginMeta,
  connectionState: ProviderConnectionState,
  state: PluginState | undefined
): ProbeStatus {
  if (plugin.supportState === "comingSoonOnWindows") {
    return { tone: "muted", label: plugin.supportMessage ?? "Coming soon on Windows." }
  }
  if (connectionState === "disabled") {
    return { tone: "muted", label: "Enable this provider to check it." }
  }
  if (state?.loading) return { tone: "info", label: "Refreshing provider status..." }
  if (connectionState === "error" && state?.error) return { tone: "error", label: state.error }
  if (connectionState === "connected") {
    return { tone: "success", label: "Provider responded successfully." }
  }
  return { tone: "muted", label: "No check has completed yet. Click Check again." }
}

export function formatTimestamp(timestamp: number | null | undefined): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)
}

export function ProviderRuntimeStatus({
  sourceLabel,
  lastSuccessAt,
  status,
  className,
}: {
  sourceLabel: string
  lastSuccessAt: number | null
  status: ProbeStatus
  className: string
}) {
  const lastSuccessText = formatTimestamp(lastSuccessAt)
  const role =
    status.tone === "error"
      ? "alert"
      : status.tone === "info" || status.tone === "success"
        ? "status"
        : undefined
  return (
    <div className={className}>
      <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Status
      </h4>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Source
          </div>
          <div className="mt-2 text-sm font-medium text-foreground">{sourceLabel}</div>
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

      <div
        role={role}
        className="mt-4 flex items-start gap-2 rounded-md border border-border/55 bg-muted/25 px-3 py-3"
      >
        {status.tone === "error" ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : status.tone === "success" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">Runtime status</div>
          <div className="select-text break-words text-muted-foreground">{status.label}</div>
        </div>
        {status.tone === "error" && (
          <button
            type="button"
            aria-label="Copy error to clipboard"
            className="ml-auto mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              navigator.clipboard.writeText(status.label).catch(console.error)
            }}
          >
            <ClipboardCopy className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
