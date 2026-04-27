import { isTauri } from "@tauri-apps/api/core"
import { emit, listen } from "@tauri-apps/api/event"
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"
import type { PluginSettings } from "@/lib/settings"

const PLUGIN_SETTINGS_UPDATED_EVENT = "plugin-settings:updated"

export async function notifyPluginSettingsUpdated(settings: PluginSettings): Promise<void> {
  if (!isTauri()) return
  await emit(PLUGIN_SETTINGS_UPDATED_EVENT, settings)
}

export async function listenPluginSettingsUpdated(
  handler: (settings: PluginSettings) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}

  const callback: EventCallback<PluginSettings> = (event) => {
    handler(event.payload)
  }
  return listen(PLUGIN_SETTINGS_UPDATED_EVENT, callback)
}
