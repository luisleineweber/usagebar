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
  /**
   * Error of the last settled probe: a message after a failure, null after a success, and
   * undefined before any settled probe. A refresh clears `error` but keeps this value.
   */
  lastSettledError?: string | null
  instanceRef?: ProviderInstanceRef
  history?: ProviderUsageHistory
  loading: boolean
  error: string | null
  errorCategory?: ProbeErrorCategory | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
  setupDetection?: SetupDetection[]
}
