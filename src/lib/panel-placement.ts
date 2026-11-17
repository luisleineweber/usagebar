import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

/**
 * Placement of the tray panel. The native side owns geometry and persistence.
 * `floating` is true only when the panel is movable and the user moved it.
 */
export type PanelPlacement = {
  movable: boolean
  floating: boolean
}

export const PANEL_PLACEMENT_CHANGED_EVENT = "panel-placement-changed"
export const DEFAULT_PANEL_MOVABLE = false

/** Keyboard steps for the move handle, in logical px. */
export const PANEL_NUDGE_STEP_PX = 10
export const PANEL_NUDGE_LARGE_STEP_PX = 50

export function parsePanelPlacement(value: unknown): PanelPlacement {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PanelPlacement).movable === "boolean" &&
    typeof (value as PanelPlacement).floating === "boolean"
  ) {
    const { movable, floating } = value as PanelPlacement
    return { movable, floating }
  }
  throw new Error(`Unexpected panel placement: ${JSON.stringify(value)}`)
}

export async function loadPanelPlacement(): Promise<PanelPlacement> {
  return parsePanelPlacement(await invoke<unknown>("get_panel_placement"))
}

export async function setPanelMovable(enabled: boolean): Promise<PanelPlacement> {
  return parsePanelPlacement(await invoke<unknown>("set_panel_movable", { enabled }))
}

export async function startPanelDrag(): Promise<void> {
  await invoke("start_panel_drag")
}

export async function nudgePanel(dx: number, dy: number): Promise<PanelPlacement> {
  return parsePanelPlacement(await invoke<unknown>("nudge_panel", { dx, dy }))
}

export async function returnPanelToTray(): Promise<PanelPlacement> {
  return parsePanelPlacement(await invoke<unknown>("return_panel_to_tray"))
}

export function listenPanelPlacement(
  onChange: (placement: PanelPlacement) => void
): Promise<UnlistenFn> {
  return listen<unknown>(PANEL_PLACEMENT_CHANGED_EVENT, (event) => {
    try {
      onChange(parsePanelPlacement(event.payload))
    } catch (error) {
      console.error("Unexpected panel placement event:", error)
    }
  })
}

/** The logical move for an arrow key, or null for any other key. */
export function panelNudgeForKey(key: string, large: boolean): { dx: number; dy: number } | null {
  const step = large ? PANEL_NUDGE_LARGE_STEP_PX : PANEL_NUDGE_STEP_PX
  switch (key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 }
    case "ArrowRight":
      return { dx: step, dy: 0 }
    case "ArrowUp":
      return { dx: 0, dy: -step }
    case "ArrowDown":
      return { dx: 0, dy: step }
    default:
      return null
  }
}
