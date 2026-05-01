use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_OPEN_EVENT: &str = "settings:open";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsWindowPayload {
    tab: String,
    provider_id: Option<String>,
}

fn normalize_tab(tab: Option<String>) -> String {
    match tab.as_deref() {
        Some("providers") => "providers".to_string(),
        _ => "general".to_string(),
    }
}

fn build_settings_window_path(tab: &str, provider_id: Option<&str>) -> String {
    let mut path = format!("index.html?window=settings&tab={}", tab);
    if let Some(provider_id) = provider_id.filter(|value| !value.trim().is_empty()) {
        path.push_str("&providerId=");
        path.push_str(provider_id);
    }
    path
}

pub fn open(
    app_handle: &AppHandle,
    tab: Option<String>,
    provider_id: Option<String>,
) -> Result<(), String> {
    let normalized_tab = normalize_tab(tab);
    let normalized_provider_id = provider_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let payload = SettingsWindowPayload {
        tab: normalized_tab.clone(),
        provider_id: normalized_provider_id.clone(),
    };

    if let Some(window) = app_handle.get_webview_window(SETTINGS_WINDOW_LABEL) {
        app_handle
            .emit_to(SETTINGS_WINDOW_LABEL, SETTINGS_OPEN_EVENT, payload)
            .map_err(|error| format!("failed to retarget settings window: {}", error))?;
        window
            .show()
            .map_err(|error| format!("failed to show settings window: {}", error))?;
        window
            .set_focus()
            .map_err(|error| format!("failed to focus settings window: {}", error))?;
    } else {
        let path = build_settings_window_path(&normalized_tab, normalized_provider_id.as_deref());
        let window = WebviewWindowBuilder::new(
            app_handle,
            SETTINGS_WINDOW_LABEL,
            WebviewUrl::App(path.into()),
        )
        .title("UsageBar Settings")
        .inner_size(960.0, 720.0)
        .max_inner_size(960.0, 720.0)
        .min_inner_size(960.0, 720.0)
        .resizable(false)
        .visible(true)
        .build()
        .map_err(|error| format!("failed to build settings window: {}", error))?;

        let _ = window.center();
        window
            .set_focus()
            .map_err(|error| format!("failed to focus settings window: {}", error))?;
    }

    Ok(())
}
