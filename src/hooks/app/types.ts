import type { PluginOutput, ProviderUsageHistory } from "@/lib/plugin-types"

export type PluginState = {
  data: PluginOutput | null
  lastSettledData?: PluginOutput | null
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
}
