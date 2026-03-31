import { useMemo } from "react"
import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import type { ProviderConfig } from "@/lib/provider-settings"

export type SettingsPluginState = {
  id: string
  name: string
  iconUrl: string
  brandColor?: string
  enabled: boolean
  supported: boolean
  supportState?: PluginMeta["supportState"]
  supportMessage: string | null
  meta: PluginMeta
  state: PluginState
  config?: ProviderConfig
}

type UseSettingsPluginListArgs = {
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
  providerConfigs: Record<string, ProviderConfig>
}

export function useSettingsPluginList({
  pluginSettings,
  pluginsMeta,
  pluginStates,
  providerConfigs,
}: UseSettingsPluginListArgs) {
  return useMemo<SettingsPluginState[]>(() => {
    if (!pluginSettings) return []
    const pluginMap = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))

    return pluginSettings.order
      .map((id) => {
        const meta = pluginMap.get(id)
        if (!meta) return null
        return {
          id,
          name: meta.name,
          iconUrl: meta.iconUrl,
          brandColor: meta.brandColor,
          enabled: !pluginSettings.disabled.includes(id),
          supported: meta.supportState !== "comingSoonOnWindows",
          supportState: meta.supportState,
          supportMessage: meta.supportMessage ?? null,
          meta,
          state: pluginStates[id] ?? {
            data: null,
            loading: false,
            error: null,
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          },
          config: providerConfigs[id],
        }
      })
      .filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== null)
  }, [pluginSettings, pluginStates, pluginsMeta, providerConfigs])
}
