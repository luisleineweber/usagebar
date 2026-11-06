import { useEffect, useState } from "react"
import {
  getTrayNumberSurface,
  isWindowsTrayPlatform,
  listenTaskbarTheme,
  loadTaskbarTheme,
  type TaskbarTheme,
} from "@/lib/taskbar-theme"

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

    void (async () => {
      try {
        // Register the listener first, so no change between the read and the
        // registration is lost.
        const stop = await listenTaskbarTheme((next) => {
          changed = true
          if (!cancelled) setTheme(next)
        })
        if (cancelled) {
          stop()
          return
        }
        unlisten = stop
      } catch (error) {
        console.error("Failed to watch the taskbar theme:", error)
        return
      }

      try {
        const initial = await loadTaskbarTheme()
        // A change event is newer than this initial read.
        if (!cancelled && !changed) setTheme(initial)
      } catch (error) {
        console.error("Failed to read the taskbar theme:", error)
      }
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled])

  return theme
}

/**
 * The surface behind the tray number. Windows reads the taskbar theme; other
 * platforms never call the Windows-only lookup.
 */
export function useTrayNumberSurface(): TaskbarTheme | null {
  const isWindows = isWindowsTrayPlatform()
  const taskbarTheme = useTaskbarTheme(isWindows)
  return getTrayNumberSurface(isWindows, taskbarTheme)
}
