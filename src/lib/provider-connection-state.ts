import type { PluginState } from "@/hooks/app/types"

/**
 * Shared provider state vocabulary for Settings.
 *
 * Each state comes from authoritative data only:
 * - unsupported: the provider cannot run on this platform.
 * - disabled: the user turned the provider off.
 * - error: the last settled probe failed.
 * - connected: the last settled probe returned provider output.
 * - setupNeeded: the provider is on, but no settled probe has returned output yet.
 *
 * While a refresh is loading, `error` is cleared and older data is retained. Neither proves
 * the current state, so the state comes from the last settled probe (`lastSettledError`).
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

export function getProviderConnectionState({
  enabled,
  supported,
  state,
}: {
  enabled: boolean
  supported: boolean
  state: Pick<PluginState, "data" | "error" | "loading" | "lastSettledError">
}): ProviderConnectionState {
  if (!supported) return "unsupported"
  if (!enabled) return "disabled"
  if (state.loading) {
    if (state.lastSettledError) return "error"
    if (state.lastSettledError === null && state.data) return "connected"
    return "setupNeeded"
  }
  if (state.error) return "error"
  if (state.data) return "connected"
  return "setupNeeded"
}
