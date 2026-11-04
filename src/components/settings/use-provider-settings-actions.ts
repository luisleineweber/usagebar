import { useCallback, useEffect, useState } from "react"
import type { SettingsFeedback } from "@/components/settings/browser-cookie-import-panel"
import { getErrorMessage } from "@/lib/error-utils"
import { captureProviderCookieHeader } from "@/lib/guided-cookie-login"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"

export type ProviderSettingsActions = ReturnType<typeof useProviderSettingsActions>

/** Save, secret, and guided-login actions for one provider, with one shared feedback line. */
export function useProviderSettingsActions({
  providerId,
  definition,
  onConfigChange,
  onSecretSave,
  onSecretDelete,
}: {
  providerId: string
  definition: ProviderSettingsDefinition
  onConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onSecretSave?: (providerId: string, secretKey: string, value: string) => Promise<void>
  onSecretDelete?: (providerId: string, secretKey: string) => Promise<void>
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingSecret, setSavingSecret] = useState(false)
  const [guidedLoginOpen, setGuidedLoginOpen] = useState(false)

  useEffect(() => {
    setMessage(null)
    setError(null)
  }, [providerId])

  const showFeedback = useCallback((feedback: SettingsFeedback | null) => {
    setMessage(feedback && "message" in feedback ? feedback.message : null)
    setError(feedback && "error" in feedback ? feedback.error : null)
  }, [])

  const saveConfig = async (
    patch: Partial<ProviderConfig>,
    successMessage: string,
    fallbackError: string
  ) => {
    if (!onConfigChange) return
    showFeedback(null)
    setSavingConfig(true)
    try {
      await onConfigChange(providerId, patch)
      showFeedback({ message: successMessage })
    } catch (cause) {
      showFeedback({ error: getErrorMessage(cause, fallbackError) })
    } finally {
      setSavingConfig(false)
    }
  }

  const saveSecret = async (key: string, value: string): Promise<boolean> => {
    if (!onSecretSave) return false
    showFeedback(null)
    setSavingSecret(true)
    try {
      await onSecretSave(providerId, key, value)
      showFeedback({ message: "Secret stored securely for this app." })
      return true
    } catch (cause) {
      showFeedback({ error: getErrorMessage(cause, "Failed to save secret.") })
      return false
    } finally {
      setSavingSecret(false)
    }
  }

  const deleteSecret = async (key: string): Promise<boolean> => {
    if (!onSecretDelete) return false
    showFeedback(null)
    setSavingSecret(true)
    try {
      await onSecretDelete(providerId, key)
      showFeedback({ message: "Stored secret removed." })
      return true
    } catch (cause) {
      showFeedback({ error: getErrorMessage(cause, "Failed to clear secret.") })
      return false
    } finally {
      setSavingSecret(false)
    }
  }

  const startGuidedLogin = async () => {
    const login = definition.guidedCookieLogin
    if (!login || !onSecretSave) return
    showFeedback(null)
    setGuidedLoginOpen(true)
    try {
      const result = await captureProviderCookieHeader({
        providerId,
        windowTitle: login.windowTitle,
        loginUrl: login.loginUrl,
        successUrlContains: login.successUrlContains,
        cookieUrls: login.cookieUrls,
      })
      await onSecretSave(providerId, login.secretKey, result.cookieHeader)
      showFeedback({ message: login.successMessage })
    } catch (cause) {
      showFeedback({ error: getErrorMessage(cause, "Guided login failed.") })
    } finally {
      setGuidedLoginOpen(false)
    }
  }

  return {
    message,
    error,
    savingConfig,
    savingSecret,
    guidedLoginOpen,
    canSaveSecret: Boolean(onSecretSave),
    canDeleteSecret: Boolean(onSecretDelete),
    onConfigChange,
    showFeedback,
    saveConfig,
    saveSecret,
    deleteSecret,
    startGuidedLogin,
  }
}
