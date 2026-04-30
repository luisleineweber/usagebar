import { isTauri } from "@tauri-apps/api/core"
import { emit, listen } from "@tauri-apps/api/event"
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event"
import type {
  DisplayMode,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings"

const DISPLAY_PREFERENCES_UPDATED_EVENT = "display-preferences:updated"

export type DisplayPreferenceUpdate =
  | { key: "themeMode"; value: ThemeMode }
  | { key: "displayMode"; value: DisplayMode }
  | { key: "resetTimerDisplayMode"; value: ResetTimerDisplayMode }
  | { key: "menubarIconStyle"; value: MenubarIconStyle }

export async function notifyDisplayPreferenceUpdated(update: DisplayPreferenceUpdate): Promise<void> {
  if (!isTauri()) return
  await emit(DISPLAY_PREFERENCES_UPDATED_EVENT, update)
}

export async function listenDisplayPreferenceUpdated(
  handler: (update: DisplayPreferenceUpdate) => void
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}

  const callback: EventCallback<DisplayPreferenceUpdate> = (event) => {
    handler(event.payload)
  }
  return listen(DISPLAY_PREFERENCES_UPDATED_EVENT, callback)
}
