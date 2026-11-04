import { useEffect, useState } from "react"
import { listenTaskbarTheme, loadTaskbarTheme, type TaskbarTheme } from "@/lib/taskbar-theme"

/**
 * Tracks the Windows taskbar theme. Returns null until the theme is known, so
 * callers never draw tray colors from a guess.
 */
export function useTaskbarTheme(enabled: boolean): TaskbarTheme | null {
  const [theme, setTheme] = useState<TaskbarTheme | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let unlisten: (() => void) | null = null
    let changed = false

    void listenTaskbarTheme((next) => {
      changed = true
      if (!cancelled) setTheme(next)
    })
      .then((stop) => {
        if (cancelled) stop()
        else unlisten = stop
      })
      .catch((error) => console.error("Failed to watch the taskbar theme:", error))

    void loadTaskbarTheme()
      .then((next) => {
        // A change event is newer than this initial read.
        if (!cancelled && !changed) setTheme(next)
      })
      .catch((error) => console.error("Failed to read the taskbar theme:", error))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled])

  return theme
}
