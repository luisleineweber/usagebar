import { invoke } from "@tauri-apps/api/core"
import type { ProviderInstanceRef, SetupDetection } from "@/lib/plugin-types"

/**
 * Runs only the provider's local setup detector. It does not run the usage probe, so it sends
 * no request to the provider and refreshes no tokens.
 */
export async function scanProviderSetup(
  pluginId: string,
  instanceRef?: ProviderInstanceRef
): Promise<SetupDetection[]> {
  return invoke<SetupDetection[]>("detect_plugin_setup", { pluginId, instanceRef })
}
