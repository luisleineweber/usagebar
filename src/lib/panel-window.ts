import { invoke } from "@tauri-apps/api/core"

export async function showPanelForView(view: string): Promise<void> {
  await invoke("show_panel_for_view", { view })
}

export async function syncPanelView(view: string): Promise<void> {
  await invoke("sync_panel_view", { view })
}
