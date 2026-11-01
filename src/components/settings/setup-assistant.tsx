import { AlertCircle, CheckCircle2, CircleX, LoaderCircle } from "lucide-react"
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
  return "Waiting for check"
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

export function SetupAssistant({
  checks,
  detections,
  loading,
}: {
  checks: ProviderSetupCheck[]
  detections?: SetupDetection[]
  loading: boolean
}) {
  return (
    <section
      className="border-t border-border/55 py-4"
      aria-labelledby="provider-setup-assistant-heading"
      aria-busy={loading}
    >
      <h4
        id="provider-setup-assistant-heading"
        className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        Setup assistant
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Local checks show which sign-in sources are ready. Secrets stay on this device.
      </p>

      <div className="mt-3 space-y-2">
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
                Source: {check.source}. {check.description} Never uploaded.
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
