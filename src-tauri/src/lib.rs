#![cfg_attr(test, allow(dead_code, unused_imports))]

mod analytics;
#[cfg(target_os = "macos")]
mod app_nap;
#[cfg(not(test))]
mod app_startup;
mod atomic_file;
mod browser_cookie_import;
pub mod cli;
mod codex_account_store;
#[cfg(not(test))]
mod credential_commands;
mod credential_support;
mod dev_data_migration;
#[cfg(not(test))]
mod global_shortcut;
mod local_http_api;
#[cfg(not(test))]
mod panel;
mod plugin_commands;
mod plugin_engine;
#[cfg(not(test))]
mod probe_commands;
mod probe_coordinator;
mod provider_secret_store;
mod provider_secrets;
#[cfg(not(test))]
mod settings_window;
#[cfg(not(test))]
mod tray;
#[cfg(target_os = "macos")]
mod webkit_config;

use std::path::PathBuf;
#[cfg(not(test))]
use std::sync::{Arc, Mutex, OnceLock};
#[cfg(test)]
use std::sync::{Mutex, OnceLock};

#[cfg(test)]
pub(crate) use analytics::{app_started_day_key, should_track_app_started};
pub(crate) use credential_support::{
    codex_profile_label, guided_cookie_policy, now_utc_unix_ms, read_provider_config_string,
    resolve_current_codex_auth, validate_guided_cookie_capture_request,
};
#[cfg(all(desktop, not(test)))]
use global_shortcut::update_global_shortcut;
#[cfg(not(test))]
use plugin_commands::list_plugins;
pub(crate) use plugin_commands::plugin_is_probe_supported;
#[cfg(test)]
pub(crate) use plugin_commands::plugin_support_for_current_platform;
pub(crate) use provider_secrets::*;
#[cfg(not(test))]
use tauri::{Emitter, Manager};
#[cfg(not(test))]
use tauri_plugin_log::{Target, TargetKind};

#[cfg(not(test))]
use credential_commands::{
    capture_provider_cookie_header, delete_codex_account_profile, delete_provider_secret,
    import_browser_cookies, import_current_codex_account_profile, list_browser_import_sources,
    list_codex_account_profiles, set_provider_secret,
};
#[cfg(not(test))]
use probe_commands::start_probe_batch;

fn pending_panel_view_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn store_pending_panel_view(view: String) {
    if let Ok(mut slot) = pending_panel_view_slot().lock() {
        *slot = Some(view);
    }
}

fn take_pending_panel_view_inner() -> Option<String> {
    pending_panel_view_slot().lock().ok()?.take()
}

#[cfg(not(test))]
pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
    pub probe_coordinator: Arc<Mutex<probe_coordinator::ProbeCoordinator>>,
}

#[cfg(not(test))]
#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    panel::init(&app_handle).expect("Failed to initialize panel");
}

#[cfg(not(test))]
#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[cfg(not(test))]
#[tauri::command]
fn reposition_panel(app_handle: tauri::AppHandle, panel_height_px: Option<f64>) {
    panel::reposition_panel(&app_handle, panel_height_px);
}

#[cfg(not(test))]
#[tauri::command]
fn sync_panel_geometry(panel_height_px: f64) {
    panel::sync_panel_geometry(panel_height_px);
}

#[cfg(not(test))]
#[tauri::command]
fn apply_panel_bounds(app_handle: tauri::AppHandle, panel_height_px: f64) {
    panel::apply_panel_bounds(&app_handle, panel_height_px);
}

#[cfg(not(test))]
#[tauri::command]
fn take_pending_panel_view() -> Option<String> {
    take_pending_panel_view_inner()
}

#[cfg(not(test))]
#[tauri::command]
fn sync_panel_view(app_handle: tauri::AppHandle, view: String) -> Result<(), String> {
    let normalized_view = view.trim().to_string();
    if normalized_view.is_empty() {
        return Err("view must not be empty".to_string());
    }

    store_pending_panel_view(normalized_view.clone());
    if app_handle.get_webview_window("main").is_some() {
        app_handle
            .emit_to("main", "tray:navigate", normalized_view)
            .map_err(|error| format!("failed to navigate tray panel: {}", error))?;
    }

    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
fn show_panel_for_view(app_handle: tauri::AppHandle, view: String) -> Result<(), String> {
    let normalized_view = view.trim().to_string();
    if normalized_view.is_empty() {
        return Err("view must not be empty".to_string());
    }

    store_pending_panel_view(normalized_view.clone());
    panel::show_panel_at_taskbar(&app_handle);
    app_handle
        .emit_to("main", "tray:navigate", normalized_view)
        .map_err(|error| format!("failed to navigate tray panel: {}", error))?;

    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
async fn open_settings_window(
    app_handle: tauri::AppHandle,
    tab: Option<String>,
    provider_id: Option<String>,
) -> Result<(), String> {
    settings_window::open(&app_handle, tab, provider_id)
}

#[cfg(not(test))]
#[tauri::command]
fn open_devtools(#[allow(unused)] app_handle: tauri::AppHandle) {
    #[cfg(debug_assertions)]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            window.open_devtools();
        }
    }
}

#[cfg(not(test))]
#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app_handle.path().app_log_dir().map_err(|e| e.to_string())?;
    let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
    Ok(log_file.to_string_lossy().to_string())
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _guard = runtime.enter();

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new("A-US-6435241436").build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .max_file_size(10_000_000) // 10 MB
                .level(log::LevelFilter::Trace) // Allow all levels; runtime filter via tray menu
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Info)
                .level_for("tauri_plugin_updater", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            reposition_panel,
            sync_panel_geometry,
            apply_panel_bounds,
            take_pending_panel_view,
            sync_panel_view,
            show_panel_for_view,
            open_settings_window,
            capture_provider_cookie_header,
            open_devtools,
            start_probe_batch,
            list_plugins,
            get_log_path,
            set_provider_secret,
            list_browser_import_sources,
            import_browser_cookies,
            delete_provider_secret,
            list_codex_account_profiles,
            import_current_codex_account_profile,
            delete_codex_account_profile,
            update_global_shortcut
        ])
        .setup(app_startup::setup)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::{
        app_started_day_key, guided_cookie_policy, is_missing_credential_error,
        plugin_is_probe_supported, plugin_support_for_current_platform, provider_secret_entry_spec,
        provider_secret_label, provider_secret_service, should_track_app_started,
        store_pending_panel_view, take_pending_panel_view_inner,
        validate_guided_cookie_capture_request, verify_provider_secret_write_with_fresh_lookup,
    };
    use crate::plugin_engine::manifest::{
        HostCapabilities, PlatformSupport, PluginManifest, WindowsSupportConfig,
        WindowsSupportState,
    };

    fn make_manifest(
        windows_state: WindowsSupportState,
        surfaced: bool,
        message: Option<&str>,
    ) -> PluginManifest {
        PluginManifest {
            schema_version: 1,
            id: "x".to_string(),
            name: "X".to_string(),
            version: "0.0.1".to_string(),
            entry: "plugin.js".to_string(),
            icon: "icon.svg".to_string(),
            brand_color: None,
            default_plan: None,
            lines: Vec::new(),
            links: Vec::new(),
            status: None,
            platform_support: PlatformSupport {
                windows: WindowsSupportConfig {
                    state: windows_state,
                    surfaced,
                    message: message.map(|value| value.to_string()),
                },
            },
            capabilities: HostCapabilities::default(),
            source_provenance: None,
        }
    }

    #[test]
    fn should_track_when_no_previous_day() {
        assert!(should_track_app_started(None, "2026-02-12"));
    }

    #[test]
    fn should_not_track_when_same_day() {
        assert!(!should_track_app_started(Some("2026-02-12"), "2026-02-12"));
    }

    #[test]
    fn should_track_when_day_changes() {
        assert!(should_track_app_started(Some("2026-02-11"), "2026-02-12"));
    }

    #[test]
    fn key_is_version_scoped() {
        let v1_key = app_started_day_key("0.6.2");
        let v2_key = app_started_day_key("0.6.3");
        assert_ne!(v1_key, v2_key);
        assert!(v1_key.ends_with("0.6.2"));
        assert!(v2_key.ends_with("0.6.3"));
    }

    #[test]
    fn pending_panel_view_is_consumed_once() {
        assert_eq!(take_pending_panel_view_inner(), None);

        store_pending_panel_view("codex".to_string());

        assert_eq!(take_pending_panel_view_inner(), Some("codex".to_string()));
        assert_eq!(take_pending_panel_view_inner(), None);
    }

    #[test]
    fn missing_credential_error_variants_are_tolerated() {
        assert!(is_missing_credential_error("No entry found"));
        assert!(is_missing_credential_error(
            "No matching entry found in secure storage"
        ));
        assert!(is_missing_credential_error("Element not found"));
        assert!(is_missing_credential_error(
            "The system cannot find the file specified. (os error 1168)"
        ));
        assert!(is_missing_credential_error("credential not found"));
        assert!(!is_missing_credential_error("permission denied"));
    }

    #[test]
    fn guided_cookie_capture_allows_only_known_zed_urls() {
        let cookie_urls = vec![
            "https://dashboard.zed.dev/account".to_string(),
            "https://cloud.zed.dev/frontend/billing/usage".to_string(),
        ];

        assert_eq!(
            validate_guided_cookie_capture_request(
                "zed",
                "https://dashboard.zed.dev/account",
                "/billing/usage",
                &cookie_urls,
            ),
            Ok(())
        );

        assert_eq!(
            validate_guided_cookie_capture_request(
                "zed",
                "https://evil.example/account",
                "/billing/usage",
                &cookie_urls,
            ),
            Err("zed guided login URL is not allowed".to_string())
        );

        for (provider_id, login_url, marker, cookie_url) in [
            (
                "abacus",
                "https://apps.abacus.ai/chatllm/admin/compute-points-usage",
                "/chatllm/admin/compute-points-usage",
                "https://apps.abacus.ai/chatllm/admin/compute-points-usage",
            ),
            (
                "perplexity",
                "https://www.perplexity.ai/account/details",
                "/account/details",
                "https://www.perplexity.ai/rest/billing/credits",
            ),
            (
                "opencode",
                "https://opencode.ai/",
                "/workspace/",
                "https://opencode.ai/",
            ),
        ] {
            assert_eq!(
                validate_guided_cookie_capture_request(
                    provider_id,
                    login_url,
                    marker,
                    &[cookie_url.to_string()],
                ),
                Ok(())
            );
            assert!(
                !guided_cookie_policy(provider_id)
                    .expect("provider policy")
                    .cookie_names
                    .is_empty()
            );
        }

        assert_eq!(
            validate_guided_cookie_capture_request(
                "ollama",
                "https://ollama.com/settings",
                "/settings",
                &["https://ollama.com/settings".to_string()],
            ),
            Err("guided cookie login is not enabled for provider 'ollama'".to_string())
        );
    }

    #[test]
    fn provider_secret_write_verification_uses_fresh_lookup_service() {
        let service = provider_secret_service("ollama", "cookieHeader");
        let expected = "session=abc123";
        let mut seen_service = None;

        let result = verify_provider_secret_write_with_fresh_lookup(
            "ollama",
            "cookieHeader",
            &service,
            expected,
            |service_name| {
                seen_service = Some(service_name.to_string());
                Ok(expected.to_string())
            },
        );

        assert_eq!(result, Ok(()));
        assert_eq!(seen_service.as_deref(), Some(service.as_str()));
    }

    #[test]
    fn provider_secret_write_verification_rejects_fresh_lookup_mismatch() {
        let service = provider_secret_service("ollama", "cookieHeader");
        let label = provider_secret_label("ollama", "cookieHeader");

        let result = verify_provider_secret_write_with_fresh_lookup(
            "ollama",
            "cookieHeader",
            &service,
            "session=abc123",
            |_| Ok("session=other".to_string()),
        );

        assert_eq!(
            result,
            Err(format!(
                "Saved {}, but the fresh system credential vault lookup returned a different value.",
                label
            ))
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn provider_secret_entry_spec_uses_explicit_windows_target() {
        let service = provider_secret_service("ollama", "cookieHeader");
        let spec = provider_secret_entry_spec(&service);

        assert_eq!(spec.target, Some(service.as_str()));
        assert_eq!(spec.service, "OpenUsage");
        assert_eq!(spec.user, "provider-secret");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn experimental_windows_provider_is_probe_supported() {
        let manifest = make_manifest(
            WindowsSupportState::Experimental,
            true,
            Some("Experimental on Windows."),
        );

        let support = plugin_support_for_current_platform(&manifest);
        assert_eq!(support.support_state, "experimental");
        assert!(support.is_surfaced);
        assert_eq!(
            support.support_message.as_deref(),
            Some("Experimental on Windows.")
        );
        assert!(plugin_is_probe_supported(&manifest));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn blocked_windows_provider_is_not_probe_supported() {
        let manifest = make_manifest(WindowsSupportState::Blocked, true, None);

        let support = plugin_support_for_current_platform(&manifest);
        assert_eq!(support.support_state, "comingSoonOnWindows");
        assert_eq!(
            support.support_message.as_deref(),
            Some("Coming soon on Windows.")
        );
        assert!(!plugin_is_probe_supported(&manifest));
    }
}
