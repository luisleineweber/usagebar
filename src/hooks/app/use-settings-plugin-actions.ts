import { useCallback } from "react"
import { track } from "@/lib/analytics"
import { savePluginSettings, type PluginSettings } from "@/lib/settings"

const TRAY_SETTINGS_DEBOUNCE_MS = 2000

type ScheduleTrayIconUpdate = (reason: "probe" | "settings" | "init", delayMs?: number) => void

type UseSettingsPluginActionsArgs = {
  pluginSettings: PluginSettings | null
  setPluginSettings: (value: PluginSettings | null) => void
  setLoadingForPlugins: (ids: string[]) => void
  setErrorForPlugins: (ids: string[], error: string) => void
  startBatch: (pluginIds?: string[]) => Promise<string[] | undefined>
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useSettingsPluginActions({
  pluginSettings,
  setPluginSettings,
  setLoadingForPlugins,
  setErrorForPlugins,
  startBatch,
  scheduleTrayIconUpdate,
}: UseSettingsPluginActionsArgs) {
  const handleReorder = useCallback((orderedIds: string[]) => {
    if (!pluginSettings) return
    track("providers_reordered", { count: orderedIds.length })
    const savedOrder = pluginSettings.order ?? []
    const orderedSet = new Set(orderedIds)
    const missingIds = savedOrder.filter((id) => !orderedSet.has(id))
    const mergedOrder = [...orderedIds]

    for (const missingId of missingIds) {
      const savedIndex = (pluginSettings.order ?? []).indexOf(missingId)
      let insertAt = 0

      for (let index = mergedOrder.length - 1; index >= 0; index -= 1) {
        const mergedSavedIndex = (pluginSettings.order ?? []).indexOf(mergedOrder[index])
        if (mergedSavedIndex < savedIndex) {
          insertAt = index + 1
          break
        }
      }

      mergedOrder.splice(insertAt, 0, missingId)
    }

    const nextSettings: PluginSettings = {
      ...pluginSettings,
      order: mergedOrder,
    }
    setPluginSettings(nextSettings)
    scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
    void savePluginSettings(nextSettings).catch((error) => {
      console.error("Failed to save plugin order:", error)
    })
  }, [pluginSettings, scheduleTrayIconUpdate, setPluginSettings])

  const handleToggle = useCallback((id: string) => {
    if (!pluginSettings) return
    const wasDisabled = pluginSettings.disabled.includes(id)
    track("provider_toggled", { provider_id: id, enabled: wasDisabled ? "true" : "false" })
    const disabled = new Set(pluginSettings.disabled)

    if (wasDisabled) {
      disabled.delete(id)
      setLoadingForPlugins([id])
      startBatch([id]).catch((error) => {
        console.error("Failed to start probe for enabled plugin:", error)
        setErrorForPlugins([id], "Failed to start probe")
      })
    } else {
      disabled.add(id)
    }

    const nextSettings: PluginSettings = {
      ...pluginSettings,
      disabled: Array.from(disabled),
    }
    setPluginSettings(nextSettings)
    scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
    void savePluginSettings(nextSettings).catch((error) => {
      console.error("Failed to save plugin toggle:", error)
    })
  }, [
    pluginSettings,
    scheduleTrayIconUpdate,
    setErrorForPlugins,
    setLoadingForPlugins,
    setPluginSettings,
    startBatch,
  ])

  return {
    handleReorder,
    handleToggle,
  }
}
