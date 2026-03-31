import type { PluginOutput } from "@/lib/plugin-types"

export type PluginState = {
  data: PluginOutput | null
  lastSettledData?: PluginOutput | null
  loading: boolean
  error: string | null
  lastManualRefreshAt: number | null
  lastSuccessAt: number | null
}
