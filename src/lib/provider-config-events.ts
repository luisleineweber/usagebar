import { isTauri } from "@tauri-apps/api/core"
import { emit, listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event"
import type { ProviderConfigs } from "@/lib/provider-settings"

const PROVIDER_CONFIGS_UPDATED_EVENT = "provider-configs:updated"

export async function notifyProviderConfigsUpdated(configs: ProviderConfigs): Promise<void> {
  if (!isTauri()) return
  await emit(PROVIDER_CONFIGS_UPDATED_EVENT, configs)
}

export async function listenProviderConfigsUpdated(
  handler: (configs: ProviderConfigs) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}
  const callback: EventCallback<ProviderConfigs> = (event) => handler(event.payload)
  return listen(PROVIDER_CONFIGS_UPDATED_EVENT, callback)
}
