import { useEffect, useState } from "react"
import { KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimestamp } from "@/components/settings/provider-runtime-status"
import type { ProviderSettingsDefinition } from "@/lib/provider-settings"

type SecretFieldDefinition = NonNullable<ProviderSettingsDefinition["secretField"]>

/**
 * One app-stored credential: stored state, a labelled entry field, and save/clear actions.
 * The visible label is the accessible name, so the control name always matches the screen.
 */
export function ProviderSecretField({
  inputId,
  resetKey,
  field,
  stateLabel,
  stored,
  updatedAt,
  storageNote,
  busy,
  onSave,
  onDelete,
  onEmptySave,
}: {
  inputId: string
  resetKey: string
  field: SecretFieldDefinition
  stateLabel: string
  stored: boolean
  updatedAt: number | null
  storageNote?: string
  busy: boolean
  onSave?: (value: string) => Promise<boolean>
  onDelete?: () => Promise<boolean>
  onEmptySave: () => void
}) {
  const [draft, setDraft] = useState("")
  const updatedText = formatTimestamp(updatedAt)
  const descriptionId = `${inputId}-description`

  useEffect(() => {
    setDraft("")
  }, [resetKey])

  const handleSave = async () => {
    if (!onSave) return
    const trimmed = draft.trim()
    if (!trimmed) {
      onEmptySave()
      return
    }
    if (await onSave(trimmed)) setDraft("")
  }

  const handleDelete = async () => {
    if (!onDelete) return
    if (await onDelete()) setDraft("")
  }

  return (
    <div className="space-y-3">
      {/* Without a stored secret the state box adds nothing; the note moves under the field. */}
      {stored ? (
        <div className="rounded-md border border-border/55 bg-muted/25 px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {stateLabel}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {`Stored${updatedText ? ` / ${updatedText}` : ""}`}
          </div>
          {storageNote ? <p className="mt-1 text-xs text-muted-foreground">{storageNote}</p> : null}
        </div>
      ) : null}
      <div>
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
        >
          {field.label}
        </label>
        <textarea
          id={inputId}
          aria-describedby={descriptionId}
          className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
          placeholder={field.placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
          {field.description}
          {!stored && storageNote ? ` ${storageNote}` : null}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={busy || !onSave}
        >
          <KeyRound className="size-3.5" aria-hidden="true" />
          {stored ? "Replace secret" : "Save secret"}
        </Button>
        {stored && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => void handleDelete()}
            disabled={busy || !onDelete}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Clear secret
          </Button>
        )}
      </div>
    </div>
  )
}
