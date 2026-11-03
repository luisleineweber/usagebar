import { useSyncExternalStore } from "react"
import { getSystemTrayColorScheme, type TrayColorScheme } from "@/lib/tray-number-icon"

const QUERY = "(prefers-color-scheme: dark)"

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/**
 * The Windows taskbar follows the system color scheme, not the app theme.
 * Returns the same scheme that the real tray icon uses.
 */
export function useSystemTrayColorScheme(): TrayColorScheme {
  return useSyncExternalStore(subscribe, getSystemTrayColorScheme, () => "dark")
}
