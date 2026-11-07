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
  /** Last settled probe error; null = last settled probe succeeded; undefined = no probe settled yet. */
  lastSettledError?: string | null
  /** Category of the last settled probe error. Same lifecycle as `lastSettledError`. */
  lastSettledErrorCategory?: ProbeErrorCategory | null
  instanceRef?: ProviderInstanceRef
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  errorCategory?: ProbeErrorCategory | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
  setupDetection?: SetupDetection[]
}
