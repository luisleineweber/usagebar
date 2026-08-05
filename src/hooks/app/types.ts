import type {
  PluginOutput,
  ProbeErrorCategory,
  ProviderInstanceRef,
  ProviderUsageHistory,
} from "@/lib/plugin-types"

export type PluginState = {
  data: PluginOutput | null
  lastSettledData?: PluginOutput | null
  instanceRef?: ProviderInstanceRef
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  errorCategory?: ProbeErrorCategory | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
}
