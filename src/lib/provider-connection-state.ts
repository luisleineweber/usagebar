import type { PluginState } from "@/hooks/app/types"

/**
 * Shared provider state vocabulary for Settings.
 *
 * Each state comes from authoritative data only:
 * - disabled: the user turned the provider off, or it cannot run on this platform.
 * - error: the latest probe failed.
 * - connected: the latest settled probe returned provider output.
 * - setupNeeded: the provider is on, but no probe has returned output yet.
 */
export type ProviderConnectionState = "connected" | "error" | "setupNeeded" | "disabled"

export const PROVIDER_CONNECTION_STATE_LABELS = {
  connected: "Connected",
  error: "Error",
  setupNeeded: "Setup needed",
  disabled: "Disabled",
} satisfies Record<ProviderConnectionState, string>

export function getProviderConnectionState({
  enabled,
  supported,
  state,
}: {
  enabled: boolean
  supported: boolean
  state: Pick<PluginState, "data" | "error">
}): ProviderConnectionState {
  if (!enabled || !supported) return "disabled"
  if (state.error) return "error"
  if (state.data) return "connected"
  return "setupNeeded"
}
