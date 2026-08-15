import { isTauri } from "@tauri-apps/api/core"
import { emit, listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event"
import type { ResetSettings } from "@/lib/settings-reset"

export const SETTINGS_RESET_EVENT = "settings:reset"

export async function notifySettingsReset(settings: ResetSettings): Promise<void> {
  if (!isTauri()) return
  await emit(SETTINGS_RESET_EVENT, settings)
}

export async function listenSettingsReset(
  handler: (settings: ResetSettings) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}
  const callback: EventCallback<ResetSettings> = (event) => handler(event.payload)
  return listen(SETTINGS_RESET_EVENT, callback)
}
