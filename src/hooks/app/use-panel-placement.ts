import { useCallback, useEffect, useState } from "react"
import { isTauri } from "@tauri-apps/api/core"
import {
  isMovablePanelSupported,
  listenPanelPlacement,
  loadPanelPlacement,
  setPanelMovable,
  type PanelPlacement,
} from "@/lib/panel-placement"

/**
 * Tracks the native panel placement. Returns null until it is known, and
 * always null where the movable panel is not supported, so the UI never shows
 * move controls from a guess.
 */
export function usePanelPlacement() {
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)

  useEffect(() => {
    if (!isTauri() || !isMovablePanelSupported()) return
    let cancelled = false
    let unlisten: (() => void) | null = null
    let changed = false

    void (async () => {
      try {
        // Register first, so no change between the read and the registration is lost.
        const stop = await listenPanelPlacement((next) => {
          changed = true
          if (!cancelled) setPlacement(next)
        })
        if (cancelled) {
          stop()
          return
        }
        unlisten = stop
      } catch (error) {
        console.error("Failed to watch the panel placement:", error)
        return
      }

      try {
        const initial = await loadPanelPlacement()
        if (!cancelled && !changed) setPlacement(initial)
      } catch (error) {
        console.error("Failed to read the panel placement:", error)
      }
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  const updateMovable = useCallback(async (enabled: boolean) => {
    setPlacement(await setPanelMovable(enabled))
  }, [])

  return { placement, updateMovable }
}
