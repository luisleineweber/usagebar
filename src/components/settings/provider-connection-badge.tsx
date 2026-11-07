import { Badge } from "@/components/ui/badge"
import {
  PROVIDER_CONNECTION_STATE_LABELS,
  type ProviderConnectionState,
} from "@/lib/provider-connection-state"
import { cn } from "@/lib/utils"

const BADGE_CLASS = {
  connected: undefined,
  error: "border-destructive/40 text-destructive",
  setupNeeded: undefined,
  disabled: "text-muted-foreground",
  unsupported: "text-muted-foreground",
} satisfies Record<ProviderConnectionState, string | undefined>

export function ProviderConnectionBadge({
  state,
  className,
}: {
  state: ProviderConnectionState
  className?: string
}) {
  return (
    <Badge
      variant={state === "connected" ? "default" : "outline"}
      className={cn(BADGE_CLASS[state], className)}
      data-state={state}
    >
      {PROVIDER_CONNECTION_STATE_LABELS[state]}
    </Badge>
  )
}
