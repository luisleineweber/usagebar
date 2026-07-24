import { useCallback } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { notifyPluginSettingsUpdated } from "@/lib/plugin-settings-events"
import { showPanelForView } from "@/lib/panel-window"
import { saveOnboardingInProgress, savePluginSettings, type PluginSettings } from "@/lib/settings"

type UseFirstRunOnboardingArgs = {
  pluginSettings: PluginSettings | null
  setPluginSettings: (settings: PluginSettings | null) => void
  setLoadingForPlugins: (providerIds: string[]) => void
  setErrorForPlugins: (providerIds: string[], error: string) => void
  startBatch: (providerIds?: string[]) => Promise<string[] | undefined>
  scheduleTrayIconUpdate: (reason: "settings", delayMs: number) => void
  finishFirstRun: () => void
}

export function useFirstRunOnboarding({
  pluginSettings,
  setPluginSettings,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
  scheduleTrayIconUpdate,
  finishFirstRun,
}: UseFirstRunOnboardingArgs) {
  const connectProviders = useCallback(
    async (providerIds: string[], providerIdsToCheck = providerIds) => {
      if (!pluginSettings) throw new Error("Provider settings are not ready")

      const selectedIds = new Set(
        providerIds.filter((providerId) => pluginSettings.order.includes(providerId))
      )
      const hidden = (pluginSettings.hidden ?? []).filter((id) => !selectedIds.has(id))
      const nextSettings: PluginSettings = {
        order: pluginSettings.order,
        disabled: pluginSettings.order.filter((id) => !selectedIds.has(id)),
        ...(hidden.length > 0 ? { hidden } : {}),
      }

      await saveOnboardingInProgress(true)
      await savePluginSettings(nextSettings)
      setPluginSettings(nextSettings)
      const idsToCheck = [...selectedIds].filter((id) => providerIdsToCheck.includes(id))
      if (idsToCheck.length === 0) return

      setLoadingForPlugins(idsToCheck)

      try {
        const startedIds = await startBatch(idsToCheck)
        if (!startedIds || startedIds.length === 0) {
          setErrorForPlugins(idsToCheck, "Die Verbindungsprüfung konnte nicht gestartet werden.")
        }
      } catch (error) {
        console.error("Failed to start onboarding probe batch:", error)
        setErrorForPlugins(idsToCheck, "Die Verbindungsprüfung konnte nicht gestartet werden.")
      }
    },
    [pluginSettings, setErrorForPlugins, setLoadingForPlugins, setPluginSettings, startBatch]
  )

  const finishOnboarding = useCallback(async () => {
    if (!pluginSettings) throw new Error("Provider settings are not ready")

    await notifyPluginSettingsUpdated(pluginSettings)
    await saveOnboardingInProgress(false)
    scheduleTrayIconUpdate("settings", 0)
    finishFirstRun()

    try {
      await getCurrentWindow().hide()
    } catch (error) {
      console.error("Failed to hide onboarding window:", error)
    }
    await showPanelForView("home")
  }, [finishFirstRun, pluginSettings, scheduleTrayIconUpdate])

  return { connectProviders, finishOnboarding }
}
