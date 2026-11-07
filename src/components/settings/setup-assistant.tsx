import { AlertCircle, CheckCircle2, CircleX, LoaderCircle, ScanSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetupScan } from "@/hooks/use-setup-scan"
import type { SetupDetection } from "@/lib/plugin-types"
import type { ProviderSetupCheck } from "@/lib/provider-settings"
import { cn } from "@/lib/utils"

function getDetectionState(
  check: ProviderSetupCheck,
  detections: SetupDetection[] | undefined,
  loading: boolean
): SetupDetection["state"] | "pending" {
  if (loading) return "pending"
  return (
    detections?.find((detection) => detection.id === check.id)?.state ??
    (detections ? "unavailable" : "pending")
  )
}

function statusCopy(state: ReturnType<typeof getDetectionState>): string {
  if (state === "found") return "Found"
  if (state === "missing") return "Not found"
  if (state === "unavailable") return "Could not inspect"
  return "Waiting for scan"
}

function StatusIcon({ state }: { state: ReturnType<typeof getDetectionState> }) {
  if (state === "found") return <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
  if (state === "missing")
    return <CircleX aria-hidden="true" className="size-4 text-muted-foreground" />
  if (state === "unavailable") {
    return <AlertCircle aria-hidden="true" className="size-4 text-destructive" />
  }
  return <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
}

/**
 * Local sign-in sources for one provider account, shown inside the sign-in section.
 *
 * "Scan again" runs only the local setup detector (`detect_plugin_setup`), never the usage
 * probe, so the scan sends nothing to the provider.
 */
export function SetupAssistant({
  checks,
  providerId,
  accountId,
  detections: probeDetections,
  loading: probeLoading,
}: {
  checks: ProviderSetupCheck[]
  providerId: string
  /** Selected managed account, or undefined for the default local login. */
  accountId?: string
  /** Detections from the last usage probe. */
  detections?: SetupDetection[]
  /** True while a usage probe runs. */
  loading: boolean
}) {
  const { detections, scanning, error, scan } = useSetupScan({
    providerId,
    accountId,
    probeDetections,
  })
  const loading = scanning || probeLoading
  return (
    <div role="group" aria-labelledby="provider-setup-detection-heading" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h5
            id="provider-setup-detection-heading"
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            On this device
          </h5>
          <p className="mt-1 text-xs text-muted-foreground">
            Local checks only. Secrets stay on this device.
          </p>
        </div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => void scan()}
          disabled={loading}
        >
          <ScanSearch className="size-3.5" aria-hidden="true" />
          {loading ? "Scanning…" : "Scan again"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Setup scan failed: {error}
        </p>
      ) : null}

      <div className="mt-2 space-y-2">
        {checks.map((check) => {
          const state = getDetectionState(check, detections, loading)
          return (
            <div
              key={check.id}
              role="group"
              aria-label={`${check.label}: ${statusCopy(state)}`}
              className={cn(
                "flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border px-3 py-2",
                state === "found" ? "border-primary/30 bg-primary/5" : "border-border/55"
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <StatusIcon state={state} />
                <span className="min-w-0 text-sm font-medium">{check.label}</span>
              </div>
              <span
                className={cn(
                  "text-xs font-medium",
                  state === "found" && "text-primary",
                  state === "unavailable" && "text-destructive",
                  state !== "found" && state !== "unavailable" && "text-muted-foreground"
                )}
                aria-hidden="true"
              >
                {statusCopy(state)}
              </span>
              <p className="basis-full pl-6 text-xs text-muted-foreground">
                Source: {check.source}. {check.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
