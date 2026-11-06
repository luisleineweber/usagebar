import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

/** The Windows taskbar theme ("Choose your default Windows mode"), not the app theme. */
export type TaskbarTheme = "light" | "dark"

export const TASKBAR_THEME_EVENT = "taskbar-theme-changed"

/** Approximate Windows 11 taskbar surfaces, for previews that match the real tray contrast. */
export const TASKBAR_BACKGROUND = {
  dark: "#202020",
  light: "#f3f3f3",
} as const satisfies Record<TaskbarTheme, string>

/** Only Windows has the native taskbar theme lookup. */
export function isWindowsTrayPlatform(): boolean {
  return navigator.userAgent.toLowerCase().includes("windows")
}

/**
 * The surface behind the tray number. Windows uses the taskbar theme and has no
 * surface until it is known. Linux panels have no common theme lookup; GNOME
 * draws a dark top bar, so Linux uses the dark surface.
 */
export function getTrayNumberSurface(
  isWindows: boolean,
  taskbarTheme: TaskbarTheme | null
): TaskbarTheme | null {
  return isWindows ? taskbarTheme : "dark"
}

function isTaskbarTheme(value: unknown): value is TaskbarTheme {
  return value === "light" || value === "dark"
}

export async function loadTaskbarTheme(): Promise<TaskbarTheme> {
  const theme = await invoke<unknown>("get_taskbar_theme")
  if (!isTaskbarTheme(theme)) throw new Error(`Unexpected taskbar theme: ${String(theme)}`)
  return theme
}

export function listenTaskbarTheme(onChange: (theme: TaskbarTheme) => void): Promise<UnlistenFn> {
  return listen<unknown>(TASKBAR_THEME_EVENT, (event) => {
    if (isTaskbarTheme(event.payload)) {
      onChange(event.payload)
      return
    }
    console.error("Unexpected taskbar theme event:", event.payload)
  })
}
