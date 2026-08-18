import { BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { UsageHistoryPeriod } from "@/lib/usage-history"

type UsageReportEmptyStateProps = {
  hasFilters: boolean
  period: UsageHistoryPeriod
  onClearFilters: () => void
  onShowLongerPeriod: () => void
}

export function UsageReportEmptyState({
  hasFilters,
  period,
  onClearFilters,
  onShowLongerPeriod,
}: UsageReportEmptyStateProps) {
  const canShowLongerPeriod = period === "7d"
  const message = hasFilters ? "No activity matches these filters" : "No activity in this period"

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
      {hasFilters || canShowLongerPeriod ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-2"
          onClick={hasFilters ? onClearFilters : onShowLongerPeriod}
        >
          {hasFilters ? "Clear filters" : "View 30 days"}
        </Button>
      ) : null}
    </div>
  )
}
