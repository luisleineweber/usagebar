import { create } from "zustand"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"
import type { ProviderConfigs } from "@/lib/provider-settings"

type AppPluginStore = {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  providerConfigs: ProviderConfigs
  setPluginsMeta: (value: PluginMeta[]) => void
  setPluginSettings: (value: PluginSettings | null) => void
  setProviderConfigs: (value: ProviderConfigs) => void
  resetState: () => void
}

const initialState = {
  pluginsMeta: [] as PluginMeta[],
  pluginSettings: null as PluginSettings | null,
  providerConfigs: {} as ProviderConfigs,
}

export const useAppPluginStore = create<AppPluginStore>((set) => ({
  ...initialState,
  setPluginsMeta: (value) => set({ pluginsMeta: value }),
  setPluginSettings: (value) => set({ pluginSettings: value }),
  setProviderConfigs: (value) => set({ providerConfigs: value }),
  resetState: () => set(initialState),
}))
