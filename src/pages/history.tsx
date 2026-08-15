import { UsageReport } from "@/components/usage-report"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { PluginOutput } from "@/lib/plugin-types"

export function HistoryPage({ plugins }: { plugins: DisplayPluginState[] }) {
  const outputs = plugins
    .map((plugin) => plugin.data ?? plugin.lastSettledData)
    .filter((output): output is PluginOutput => Boolean(output))

  return (
    <div className="space-y-3 py-3">
      <div>
        <h2 className="text-lg font-semibold">History</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Cost, tokens, requests, and model mix from provider-owned local or account history.
        </p>
      </div>
      <UsageReport
        outputs={outputs}
        showProviderFilter
        stale={plugins.some((plugin) => plugin.error && (plugin.data || plugin.lastSettledData))}
      />
    </div>
  )
}
