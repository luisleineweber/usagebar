import { Bell, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { UsageEvent } from "@/lib/notification-events"

export function UsageEventNotice({
  events,
  onDismiss,
}: {
  events: UsageEvent[]
  onDismiss: () => void
}) {
  if (events.length === 0) {
    return <div role="status" aria-live="polite" className="sr-only" />
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-auto absolute inset-x-2 top-2 z-40 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">UsageBar notification</div>
          <ul className="mt-1 space-y-1">
            {events.slice(0, 3).map((event) => (
              <li key={event.id}>
                <div className="truncate text-sm font-medium">{event.title}</div>
                <div className="text-xs text-muted-foreground">{event.body}</div>
              </li>
            ))}
          </ul>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss notifications"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
