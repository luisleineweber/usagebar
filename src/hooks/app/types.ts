import type {
  PluginOutput,
  ProbeErrorCategory,
  ProviderInstanceRef,
  ProviderUsageHistory,
  SetupDetection,
} from "@/lib/plugin-types"

export type PluginState = {
  data: PluginOutput | null
  lastSettledData?: PluginOutput | null
  instanceRef?: ProviderInstanceRef
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  /** Error of the last settled probe. Kept while a refresh runs; null after a success. */
  lastSettledError?: string | null
  errorCategory?: ProbeErrorCategory | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
  setupDetection?: SetupDetection[]
}
