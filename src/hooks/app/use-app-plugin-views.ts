import { useEffect, useMemo, useRef } from "react"
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
  const lastResolvedNavPluginsRef = useRef<NavPlugin[]>([])
  const lastResolvedSelectedPluginRef = useRef<DisplayPluginState | null>(null)

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
            lastSettledData: null,
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
      supportState: plugin.meta.supportState,
      supportMessage: plugin.meta.supportMessage,
    }))
  }, [enabledSupportedPlugins])

  const hasResolvedViews = pluginSettings !== null && pluginsMeta.length > 0

  useEffect(() => {
    if (navPlugins.length > 0) {
      lastResolvedNavPluginsRef.current = navPlugins
    }
  }, [navPlugins])

  useEffect(() => {
    if (activeView === "home") return
    if (!pluginSettings) return
    const isKnownPlugin = pluginsMeta.some((plugin) => plugin.id === activeView)
    if (!isKnownPlugin) return
    const isStillEnabled = enabledSupportedPlugins.some((plugin) => plugin.meta.id === activeView)
    if (!isStillEnabled) {
      setActiveView("home")
    }
  }, [activeView, enabledSupportedPlugins, pluginSettings, pluginsMeta, setActiveView])

  const selectedPlugin = useMemo(() => {
    if (activeView === "home") return null
    return enabledSupportedPlugins.find((plugin) => plugin.meta.id === activeView) ?? null
  }, [activeView, enabledSupportedPlugins])

  useEffect(() => {
    if (selectedPlugin) {
      lastResolvedSelectedPluginRef.current = selectedPlugin
      return
    }
    if (activeView === "home") {
      lastResolvedSelectedPluginRef.current = null
    }
  }, [activeView, selectedPlugin])

  const resolvedSelectedPlugin = useMemo(() => {
    if (selectedPlugin) return selectedPlugin
    if (activeView === "home") return null
    const fallback = lastResolvedSelectedPluginRef.current
    if (!fallback) return null
    if (fallback.meta.id !== activeView) return null
    return {
      ...fallback,
      data: fallback.data ?? fallback.lastSettledData ?? null,
      lastSettledData: fallback.lastSettledData ?? fallback.data ?? null,
      loading: true,
      error: null,
    }
  }, [activeView, selectedPlugin])

  return {
    displayPlugins,
    navPlugins: navPlugins.length > 0 ? navPlugins : lastResolvedNavPluginsRef.current,
    hasResolvedViews,
    selectedPlugin,
    resolvedSelectedPlugin,
  }
}
