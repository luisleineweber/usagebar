import { useEffect, useState } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ProviderSettingsDefinition } from "@/lib/provider-settings"
import { getErrorMessage } from "@/lib/error-utils"
import { getProviderCookieGuidance } from "@/lib/provider-onboarding-guidance"

type OnboardingCookieFieldProps = {
  providerId: string
  providerName: string
  definition: ProviderSettingsDefinition
  onSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onRetry: () => void
}

export function OnboardingCookieField({
  providerId,
  providerName,
  definition,
  onSecretSave,
  onRetry,
}: OnboardingCookieFieldProps) {
  const [cookieHeader, setCookieHeader] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setCookieHeader("")
    setSaveError(null)
  }, [providerId])

  const secretField = definition.secretField
  if (!secretField || secretField.key !== "cookieHeader") return null
  const guidance = getProviderCookieGuidance(providerId)

  const saveCookie = async () => {
    const value = cookieHeader.trim()
    if (!value) {
      setSaveError("Enter the complete Cookie header.")
      return
    }

    setSaveError(null)
    setIsSaving(true)
    try {
      await onSecretSave(providerId, secretField.key, value)
      setCookieHeader("")
      onRetry()
    } catch (error) {
      console.error(`Failed to save ${providerName} onboarding cookie:`, error)
      setSaveError(getErrorMessage(error, "Unable to save the Cookie header."))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">Connect this provider</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose one option. The steps show which value to enter.
        </p>
      </div>
      <div className="space-y-3">
        {guidance.map((variant, index) => (
          <div
            key={variant.title}
            className={index === 0 ? undefined : "border-t border-border/70 pt-3"}
          >
            <p className="text-xs font-semibold">{variant.title}</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
              {variant.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div>
        <label
          htmlFor={`onboarding-cookie-${providerId}`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          {secretField.label}
        </label>
        <textarea
          id={`onboarding-cookie-${providerId}`}
          aria-label={`${providerName} ${secretField.label}`}
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus-visible:ring-1 focus-visible:ring-primary"
          placeholder={secretField.placeholder}
          value={cookieHeader}
          onChange={(event) => setCookieHeader(event.target.value)}
          disabled={isSaving}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {saveError ? (
        <p role="alert" className="text-xs text-destructive">
          {saveError}
        </p>
      ) : null}
      <Button type="button" size="xs" onClick={() => void saveCookie()} disabled={isSaving}>
        <KeyRound className="size-3" />
        {isSaving ? "Saving Cookie header…" : "Save Cookie header and check again"}
      </Button>
    </div>
  )
}
