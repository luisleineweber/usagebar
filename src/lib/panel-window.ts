import { invoke } from "@tauri-apps/api/core"

export async function showPanelForView(view: string): Promise<void> {
  await invoke("show_panel_for_view", { view })
}
