import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getErrorMessage } from "@/lib/error-utils"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"

type TextFieldDefinition = NonNullable<ProviderSettingsDefinition["textField"]>

const FIELD_LABEL_CLASS =
  "mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"

/** One provider text setting, such as a workspace ID or billing scope, with its own feedback. */
export function ProviderTextSetting({
  providerId,
  field,
  value,
  onConfigChange,
}: {
  providerId: string
  field: TextFieldDefinition
  value: string | undefined
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
}) {
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string } | { error: string } | null>(null)
  const inputId = `provider-text-${providerId}`
  const descriptionId = `${inputId}-description`

  useEffect(() => {
    setDraft(value ?? "")
    setFeedback(null)
  }, [value, providerId])

  const save = async () => {
    if (!onConfigChange) return
    setFeedback(null)
    setSaving(true)
    try {
      await onConfigChange(providerId, { [field.key]: draft.trim() || undefined })
      setFeedback({ message: `${field.label} saved.` })
    } catch (error) {
      setFeedback({ error: getErrorMessage(error, `Failed to save ${field.label}.`) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className={FIELD_LABEL_CLASS}>
        {field.label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          aria-describedby={descriptionId}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary focus:border-primary"
          placeholder={field.placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="button"
          size="default"
          onClick={() => void save()}
          disabled={saving || !onConfigChange}
        >
          Save
        </Button>
      </div>
      <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
        {field.description}
      </p>
      {feedback && "message" in feedback ? (
        <p role="status" className="mt-2 text-xs text-primary">
          {feedback.message}
        </p>
      ) : null}
      {feedback && "error" in feedback ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {feedback.error}
        </p>
      ) : null}
    </div>
  )
}
