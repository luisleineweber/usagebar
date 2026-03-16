import { invoke } from "@tauri-apps/api/core"

export type SettingsWindowTab = "general" | "providers"

export type SettingsWindowTarget = {
  tab?: SettingsWindowTab
  providerId?: string | null
}

export function parseSettingsWindowLocation(search: string): SettingsWindowTarget {
  const params = new URLSearchParams(search)
  const tab = params.get("tab") === "providers" ? "providers" : "general"
  const providerId = params.get("providerId")
  return {
    tab,
    providerId: providerId && providerId.trim() ? providerId : null,
  }
}

export async function openSettingsWindow(target: SettingsWindowTarget = {}): Promise<void> {
  await invoke("open_settings_window", {
    tab: target.tab ?? "general",
    providerId: target.providerId ?? null,
  })
}
