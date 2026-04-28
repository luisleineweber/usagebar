import { useEffect, useMemo, useState } from "react"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import { getProbeEligiblePluginIds } from "@/lib/settings"
import { fetchProviderStatus, type ProviderStatus } from "@/lib/provider-status"

const STATUS_REFRESH_MS = 5 * 60_000

export function useProviderStatuses({
  pluginsMeta,
  pluginSettings,
}: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
}) {
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({})

  const statusPlugins = useMemo(() => {
    if (!pluginSettings) return []
    const eligible = new Set(getProbeEligiblePluginIds(pluginSettings, pluginsMeta))
    return pluginsMeta.filter((plugin) => eligible.has(plugin.id) && Boolean(plugin.statusPageUrl))
  }, [pluginSettings, pluginsMeta])

  useEffect(() => {
    let cancelled = false

    const refresh = () => {
      for (const plugin of statusPlugins) {
        void fetchProviderStatus(plugin)
          .then((status) => {
            if (cancelled || !status) return
            setStatuses((prev) => ({ ...prev, [plugin.id]: status }))
          })
          .catch((error) => {
            console.warn(`Failed to fetch ${plugin.name} status:`, error)
          })
      }
    }

    refresh()
    const interval = window.setInterval(refresh, STATUS_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [statusPlugins])

  return statuses
}
