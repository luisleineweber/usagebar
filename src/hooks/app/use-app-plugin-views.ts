import { useEffect, useMemo } from "react"
import type { ActiveView, NavPlugin } from "@/components/side-nav"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import type { PluginState } from "@/hooks/app/types"

export type DisplayPluginState = { meta: PluginMeta } & PluginState

type UseAppPluginViewsArgs = {
  activeView: ActiveView
  setActiveView: (view: ActiveView) => void
  pluginSettings: PluginSettings | null
  pluginsMeta: PluginMeta[]
  pluginStates: Record<string, PluginState>
}

export function useAppPluginViews({
  activeView,
  setActiveView,
  pluginSettings,
  pluginsMeta,
  pluginStates,
}: UseAppPluginViewsArgs) {
  const enabledSupportedPlugins = useMemo<DisplayPluginState[]>(() => {
    if (!pluginSettings) return []
    const disabledSet = new Set(pluginSettings.disabled)
    const metaById = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))

    return pluginSettings.order
      .map((id) => {
        const meta = metaById.get(id)
        if (!meta) return null
        const isSupported = meta.supportState !== "comingSoonOnWindows"
        const isEnabled = !disabledSet.has(id)
        if (!isEnabled || !isSupported) return null
        const state =
          pluginStates[id] ?? {
            data: null,
            loading: false,
            error: null,
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          }
        return {
          meta,
          ...state,
          data: state.data,
          loading: state.loading,
          error: state.error,
        }
      })
      .filter((plugin): plugin is DisplayPluginState => Boolean(plugin))
  }, [pluginSettings, pluginStates, pluginsMeta])

  const displayPlugins = useMemo<DisplayPluginState[]>(
    () =>
      enabledSupportedPlugins.filter(
        (plugin) => plugin.loading || plugin.data !== null || plugin.error !== null
      ),
    [enabledSupportedPlugins]
  )

  const navPlugins = useMemo<NavPlugin[]>(() => {
    return enabledSupportedPlugins.map((plugin) => ({
      id: plugin.meta.id,
      name: plugin.meta.name,
      iconUrl: plugin.meta.iconUrl,
      brandColor: plugin.meta.brandColor,
    }))
  }, [enabledSupportedPlugins])

  useEffect(() => {
    if (activeView === "home" || activeView === "settings") return
    if (!pluginSettings) return
    const isKnownPlugin = pluginsMeta.some((plugin) => plugin.id === activeView)
    if (!isKnownPlugin) return
    const isStillEnabled = enabledSupportedPlugins.some((plugin) => plugin.meta.id === activeView)
    if (!isStillEnabled) {
      setActiveView("home")
    }
  }, [activeView, enabledSupportedPlugins, pluginSettings, pluginsMeta, setActiveView])

  const selectedPlugin = useMemo(() => {
    if (activeView === "home" || activeView === "settings") return null
    return enabledSupportedPlugins.find((plugin) => plugin.meta.id === activeView) ?? null
  }, [activeView, enabledSupportedPlugins])

  return {
    displayPlugins,
    navPlugins,
    selectedPlugin,
  }
}
