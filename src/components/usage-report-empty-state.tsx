import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"

type UsageReportEmptyStateProps = {
  message: string
  action?: { label: string; onClick: () => void }
}

export function UsageReportEmptyState({ message, action }: UsageReportEmptyStateProps) {
  return (
    <div
      className="flex min-h-[86px] flex-col items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 px-3 py-3 text-center"
      role="status"
      aria-label={message}
    >
      <span
        className="mb-1.5 flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <BarChart3 className="size-4" />
      </span>
      <p className="text-xs font-medium">{message}</p>
      {action ? (
        <Button type="button" variant="outline" size="xs" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
