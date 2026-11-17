import { useId, type KeyboardEvent, type MouseEvent } from "react"
import { Anchor, GripHorizontal } from "lucide-react"
import {
  nudgePanel,
  panelNudgeForKey,
  returnPanelToTray,
  startPanelDrag,
  type PanelPlacement,
} from "@/lib/panel-placement"

type PanelMoveHandleProps = {
  placement: PanelPlacement | null
}

function reportFailure(action: string) {
  // Tauri commands reject with a string message; other failures are Errors.
  return (error: Error | string) => console.error(`Failed to ${action}:`, error)
}

/**
 * Move strip for the opt-in movable panel. Drag the grip with the primary
 * button, or focus it and use the arrow keys (Shift for larger steps).
 * "Return to tray" anchors the panel again; double-clicking the grip does the
 * same as a shortcut.
 */
export function PanelMoveHandle({ placement }: PanelMoveHandleProps) {
  const hintId = useId()
  if (!placement?.movable) return null

  const returnToTray = () => {
    void returnPanelToTray().catch(reportFailure("return the panel to the tray"))
  }

  // The native move loop takes the mouse, so the grip never receives a
  // dblclick event. The second press of a double-click arrives as detail 2.
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    if (event.detail >= 2) {
      returnToTray()
      return
    }
    void startPanelDrag().catch(reportFailure("start moving the panel"))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nudge = panelNudgeForKey(event.key, event.shiftKey)
    if (!nudge) return
    event.preventDefault()
    void nudgePanel(nudge.dx, nudge.dy).catch(reportFailure("move the panel"))
  }

  return (
    <div className="-mt-1 mb-1 flex h-7 items-center gap-1" data-testid="panel-move-strip">
      <button
        type="button"
        aria-label="Move panel"
        aria-describedby={hintId}
        title="Drag to move. Arrow keys also move it. Double-click to return it to the tray."
        className="flex h-7 min-w-0 flex-1 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        <GripHorizontal className="size-4" aria-hidden="true" />
      </button>
      <span id={hintId} className="sr-only">
        Use the arrow keys to move the panel. Hold Shift for larger steps.
      </span>
      {placement.floating ? (
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={returnToTray}
        >
          <Anchor className="size-3.5" aria-hidden="true" />
          Return to tray
        </button>
      ) : null}
    </div>
  )
}
