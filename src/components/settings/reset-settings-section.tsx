import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Button } from "@/components/ui/button"

type ResetSettingsSectionProps = {
  onResetAllSettings: () => Promise<void>
}

export function ResetSettingsSection({ onResetAllSettings }: ResetSettingsSectionProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isConfirmOpen) return
    cancelRef.current?.focus()

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || isResetting) return
      setIsConfirmOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [isConfirmOpen, isResetting])

  const closeConfirmation = () => {
    if (isResetting) return
    setIsConfirmOpen(false)
    triggerRef.current?.focus()
  }

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
    )
    if (!focusable || focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const confirmReset = async () => {
    setError(null)
    setIsResetting(true)
    try {
      await onResetAllSettings()
      setIsConfirmOpen(false)
      triggerRef.current?.focus()
    } catch (resetError) {
      console.error("Failed to reset settings:", resetError)
      setError("Settings could not be reset. Try again.")
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <section className="border-t border-border/55 pt-4" aria-labelledby="reset-settings-heading">
      <h3 id="reset-settings-heading" className="mb-0 text-base font-semibold">
        Reset Settings
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Restore UsageBar preferences to their defaults.
      </p>
      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        className="w-full justify-center sm:w-auto"
        onClick={() => {
          setError(null)
          setIsConfirmOpen(true)
        }}
        disabled={isResetting}
      >
        Reset all settings
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-settings-confirm-title"
            aria-describedby="reset-settings-confirm-description"
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 text-foreground shadow-lg"
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="reset-settings-confirm-title" className="text-lg font-semibold">
              Reset all settings?
            </h2>
            <p
              id="reset-settings-confirm-description"
              className="mt-2 text-sm text-muted-foreground"
            >
              This restores UsageBar preferences to their defaults. Saved provider credentials,
              provider setup, usage history, and notification history stay in place.
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                ref={cancelRef}
                type="button"
                variant="outline"
                onClick={closeConfirmation}
                disabled={isResetting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmReset()}
                disabled={isResetting}
              >
                {isResetting ? "Resetting…" : "Reset settings"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
