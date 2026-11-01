import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function GuidedCookieLoginPanel({
  buttonLabel,
  waiting,
  disabled,
  onStart,
}: {
  buttonLabel: string
  waiting: boolean
  disabled: boolean
  onStart: () => void
}) {
  return (
    <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Guided login
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Opens a provider login window and stores only the captured Cookie header after the target
        usage page loads.
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={onStart} disabled={disabled}>
        <ExternalLink className="size-3.5" aria-hidden="true" />
        {waiting ? "Waiting for login..." : buttonLabel}
      </Button>
    </div>
  )
}
