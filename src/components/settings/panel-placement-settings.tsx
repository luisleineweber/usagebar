import { useState } from "react"
import { Anchor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { SettingsFeedbackLine } from "@/components/settings/settings-feedback-line"
import { usePanelPlacement } from "@/hooks/app/use-panel-placement"
import { returnPanelToTray } from "@/lib/panel-placement"
import { getErrorMessage } from "@/lib/error-utils"

/** Opt-in movable tray panel. The panel stays anchored to the tray by default. */
export function PanelPlacementSettings() {
  const { placement, updateMovable } = usePanelPlacement()
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<unknown>) => {
    setError(null)
    void action().catch((cause: unknown) => {
      console.error("Failed to update the panel placement:", cause)
      setError(getErrorMessage(cause, "Could not update the panel position."))
    })
  }

  if (!placement) return null

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          id="movable-panel"
          key={`movable-panel-${placement.movable}`}
          aria-describedby="movable-panel-hint"
          checked={placement.movable}
          onCheckedChange={(checked) => run(() => updateMovable(checked === true))}
        />
        <label htmlFor="movable-panel" className="cursor-pointer select-none">
          Movable panel
        </label>
      </div>
      <p id="movable-panel-hint" className="mt-1.5 text-xs text-muted-foreground">
        Drag the grip at the top of the panel, or focus it and use the arrow keys. The panel opens
        where you left it.
      </p>
      {placement.floating ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => run(returnPanelToTray)}
        >
          <Anchor className="size-4" aria-hidden="true" />
          Return to tray
        </Button>
      ) : null}
      <SettingsFeedbackLine message={null} error={error} />
    </div>
  )
}
