import { UsageReport } from "@/components/usage-report"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { PluginOutput } from "@/lib/plugin-types"

export function HistoryPage({ plugins }: { plugins: DisplayPluginState[] }) {
  const outputs = plugins
    .map((plugin) => plugin.data ?? plugin.lastSettledData)
    .filter((output): output is PluginOutput => Boolean(output))

  return (
    <div className="py-3">
      <UsageReport
        outputs={outputs}
        showProviderFilter
        sectionHeading="Usage History"
        headingLevel="h2"
        showSectionBorder={false}
        stale={plugins.some((plugin) => plugin.error && (plugin.data || plugin.lastSettledData))}
      />
    </div>
  )
}
