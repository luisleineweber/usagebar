import { UsageReport } from "@/components/usage-report"
import { UsageReportEmptyState } from "@/components/usage-report-empty-state"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { PluginOutput } from "@/lib/plugin-types"
import { hasUsageHistory } from "@/lib/usage-history"

const HEADING = "Usage History"

export function HistoryPage({ plugins }: { plugins: DisplayPluginState[] }) {
  const outputs = plugins
    .map((plugin) => plugin.data ?? plugin.lastSettledData)
    .filter((output): output is PluginOutput => Boolean(output))

  if (!hasUsageHistory(outputs)) {
    return (
      <section className="space-y-2 py-3" aria-label={HEADING}>
        <h2 className="text-lg font-semibold">{HEADING}</h2>
        <UsageReportEmptyState message="No usage history yet" />
      </section>
    )
  }

  return (
    <div className="py-3">
      <UsageReport
        outputs={outputs}
        showProviderFilter
        sectionHeading={HEADING}
        headingLevel="h2"
        showSectionBorder={false}
        stale={plugins.some((plugin) => plugin.error && (plugin.data || plugin.lastSettledData))}
      />
    </div>
  )
}
