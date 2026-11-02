import type { PluginState } from "@/hooks/app/types"

/**
 * Shared provider state vocabulary for Settings.
 *
 * Each state comes from the last settled probe result only. Retained output is display data,
 * not proof of a current connection.
 * - unsupported: the provider cannot run on this platform, whatever the Enabled setting is.
 * - disabled: the user turned the provider off.
 * - error: the last settled probe failed.
 * - connected: the last settled probe returned provider output.
 * - setupNeeded: the provider is on, but no probe has settled yet.
 *
 * While a probe runs, the state keeps the last settled result. A refresh after a failure
 * therefore stays "error" until a probe succeeds.
 */
export type ProviderConnectionState =
  | "connected"
  | "error"
  | "setupNeeded"
  | "disabled"
  | "unsupported"

export const PROVIDER_CONNECTION_STATE_LABELS = {
  connected: "Connected",
  error: "Error",
  setupNeeded: "Setup needed",
  disabled: "Disabled",
  unsupported: "Unsupported",
} satisfies Record<ProviderConnectionState, string>

export type ProviderConnectionProbeState = Pick<
  PluginState,
  "data" | "error" | "loading" | "lastSettledError"
>

export function getProviderConnectionState({
  enabled,
  supported,
  state,
}: {
  enabled: boolean
  supported: boolean
  state: ProviderConnectionProbeState
}): ProviderConnectionState {
  if (!supported) return "unsupported"
  if (!enabled) return "disabled"
  const settledError = state.loading ? state.lastSettledError : state.error
  if (settledError) return "error"
  // While loading, retained data comes from the last settled success: a settled failure
  // was handled above, and a new provider instance starts without retained data.
  if (state.data) return "connected"
  return "setupNeeded"
}
