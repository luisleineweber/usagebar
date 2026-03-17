#[cfg(target_os = "macos")]
mod app_nap;
mod panel;
mod plugin_engine;
mod settings_window;
mod tray;
#[cfg(target_os = "macos")]
mod webkit_config;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use keyring::Entry;
use serde::Serialize;
use tauri::{Emitter, Manager};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_log::{Target, TargetKind};
use uuid::Uuid;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const APP_STARTED_TRACKED_DAY_KEY_PREFIX: &str = "analytics.app_started_day.";
const PROVIDER_SECRET_KEYRING_TARGET: &str = "OpenUsage";

fn provider_secret_service(provider_id: &str, secret_key: &str) -> String {
    format!("OpenUsage Provider Secret {} {}", provider_id, secret_key)
}

fn provider_secret_legacy_services(provider_id: &str, secret_key: &str) -> Vec<String> {
    match (provider_id, secret_key) {
        ("opencode", "cookieHeader") => vec!["OpenCode Cookie Header".to_string()],
        _ => Vec::new(),
    }
}

fn delete_provider_secret_service(service: &str) -> Result<(), String> {
    let entry = Entry::new(PROVIDER_SECRET_KEYRING_TARGET, service)
        .map_err(|error| format!("credential store unavailable: {}", error))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(error) => {
            let message = error.to_string().to_lowercase();
            if is_missing_credential_error(&message) {
                Ok(())
            } else {
                Err(format!("credential delete failed: {}", error))
            }
        }
    }
}

fn is_missing_credential_error(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("no entry")
        || normalized.contains("no matching entry found")
        || normalized.contains("not found")
        || normalized.contains("cannot find")
        || normalized.contains("element not found")
        || normalized.contains("credential not found")
        || normalized.contains("specified file could not be found")
        || normalized.contains("system cannot find the file specified")
        || normalized.contains("os error 1168")
}

fn read_provider_secret_service(service: &str) -> Result<String, String> {
    let entry = Entry::new(PROVIDER_SECRET_KEYRING_TARGET, service)
        .map_err(|error| format!("credential store unavailable: {}", error))?;
    entry
        .get_password()
        .map_err(|error| format!("credential read-after-write failed: {}", error))
}

fn verify_provider_secret_write_with_fresh_lookup<F>(
    service: &str,
    expected_value: &str,
    read_secret: F,
) -> Result<(), String>
where
    F: FnOnce(&str) -> Result<String, String>,
{
    let read_back = read_secret(service)?;
    if read_back != expected_value {
        return Err("credential read-after-write mismatch".to_string());
    }
    Ok(())
}

fn app_started_day_key(version: &str) -> String {
    format!("{}{}", APP_STARTED_TRACKED_DAY_KEY_PREFIX, version)
}

fn today_utc_ymd() -> String {
    let date = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    )
}

fn should_track_app_started(last_tracked_day: Option<&str>, today: &str) -> bool {
    match last_tracked_day {
        Some(day) => day != today,
        None => true,
    }
}

#[cfg(desktop)]
fn track_app_started_once_per_day_per_version(app: &tauri::App) {
    use tauri_plugin_store::StoreExt;

    let version = app.package_info().version.to_string();
    let key = app_started_day_key(&version);
    let today = today_utc_ymd();

    let store = match app.handle().store("settings.json") {
        Ok(store) => store,
        Err(error) => {
            log::warn!(
                "Failed to access settings store for app_started gate: {}",
                error
            );
            return;
        }
    };

    let last_tracked_day = store
        .get(&key)
        .and_then(|value| value.as_str().map(|value| value.to_string()));

    if !should_track_app_started(last_tracked_day.as_deref(), &today) {
        return;
    }

    let _ = app.track_event("app_started", None);

    store.set(&key, serde_json::Value::String(today));
    if let Err(error) = store.save() {
        log::warn!("Failed to save app_started tracked day: {}", error);
    }
}

#[cfg(not(desktop))]
fn track_app_started_once_per_day_per_version(app: &tauri::App) {
    let _ = app.track_event("app_started", None);
}

#[cfg(desktop)]
fn managed_shortcut_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Shared shortcut handler that toggles the panel when the shortcut is pressed.
#[cfg(desktop)]
fn handle_global_shortcut(
    app: &tauri::AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state == ShortcutState::Pressed {
        log::debug!("Global shortcut triggered");
        panel::toggle_panel(app);
    }
}

pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub brand_color: Option<String>,
    pub support_state: String,
    pub support_message: Option<String>,
    pub is_surfaced: bool,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchComplete {
    pub batch_id: String,
}

#[tauri::command]
fn init_panel(app_handle: tauri::AppHandle) {
    panel::init(&app_handle).expect("Failed to initialize panel");
}

#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn reposition_panel(app_handle: tauri::AppHandle, panel_height_px: Option<f64>) {
    panel::reposition_panel(&app_handle, panel_height_px);
}

#[tauri::command]
fn show_panel_for_view(app_handle: tauri::AppHandle, view: String) -> Result<(), String> {
    let normalized_view = view.trim().to_string();
    if normalized_view.is_empty() {
        return Err("view must not be empty".to_string());
    }

    panel::reposition_panel(&app_handle, None);
    panel::show_panel(&app_handle);
    app_handle
        .emit("tray:navigate", normalized_view)
        .map_err(|error| format!("failed to navigate tray panel: {}", error))?;

    Ok(())
}

#[tauri::command]
async fn open_settings_window(
    app_handle: tauri::AppHandle,
    tab: Option<String>,
    provider_id: Option<String>,
) -> Result<(), String> {
    settings_window::open(&app_handle, tab, provider_id)
}

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

#[tauri::command]
async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };
    let selected_plugins: Vec<_> = selected_plugins
        .into_iter()
        .filter(|plugin| plugin_is_probe_supported(&plugin.manifest))
        .collect();

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let remaining = Arc::new(AtomicUsize::new(selected_plugins.len()));
    for plugin in selected_plugins {
        let handle = app_handle.clone();
        let completion_handle = app_handle.clone();
        let bid = batch_id.clone();
        let completion_bid = batch_id.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let counter = Arc::clone(&remaining);

        tauri::async_runtime::spawn_blocking(move || {
            let plugin_id = plugin.manifest.id.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version)
            }));

            match result {
                Ok(output) => {
                    let has_error = output.lines.iter().any(|line| {
                        matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                    });
                    if has_error {
                        log::warn!("probe {} completed with error", plugin_id);
                    } else {
                        log::info!(
                            "probe {} completed ok ({} lines)",
                            plugin_id,
                            output.lines.len()
                        );
                    }
                    let _ = handle.emit(
                        "probe:result",
                        ProbeResult {
                            batch_id: bid,
                            output,
                        },
                    );
                }
                Err(_) => {
                    log::error!("probe {} panicked", plugin_id);
                }
            }

            if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                log::info!("probe batch {} complete", completion_bid);
                let _ = completion_handle.emit(
                    "probe:batch-complete",
                    ProbeBatchComplete {
                        batch_id: completion_bid,
                    },
                );
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}

#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app_handle.path().app_log_dir().map_err(|e| e.to_string())?;
    let log_file = log_dir.join(format!("{}.log", app_handle.package_info().name));
    Ok(log_file.to_string_lossy().to_string())
}

#[tauri::command]
fn set_provider_secret(
    provider_id: String,
    secret_key: String,
    value: String,
) -> Result<(), String> {
    let trimmed_provider = provider_id.trim();
    let trimmed_secret = secret_key.trim();
    let trimmed_value = value.trim();

    if trimmed_provider.is_empty() || trimmed_secret.is_empty() {
        return Err("provider and secret key are required".to_string());
    }
    if trimmed_value.is_empty() {
        return Err("secret value cannot be empty".to_string());
    }

    let service = provider_secret_service(trimmed_provider, trimmed_secret);
    log::info!(
        "setting provider secret for provider='{}' key='{}'",
        trimmed_provider,
        trimmed_secret
    );
    let entry = Entry::new(PROVIDER_SECRET_KEYRING_TARGET, &service)
        .map_err(|error| format!("credential store unavailable: {}", error))?;

    entry
        .set_password(trimmed_value)
        .map_err(|error| format!("credential write failed: {}", error))?;

    verify_provider_secret_write_with_fresh_lookup(&service, trimmed_value, |service| {
        read_provider_secret_service(service)
    })
}

#[tauri::command]
fn delete_provider_secret(provider_id: String, secret_key: String) -> Result<(), String> {
    let trimmed_provider = provider_id.trim();
    let trimmed_secret = secret_key.trim();

    if trimmed_provider.is_empty() || trimmed_secret.is_empty() {
        return Err("provider and secret key are required".to_string());
    }

    log::info!(
        "deleting provider secret for provider='{}' key='{}'",
        trimmed_provider,
        trimmed_secret
    );
    let mut services = vec![provider_secret_service(trimmed_provider, trimmed_secret)];
    services.extend(provider_secret_legacy_services(
        trimmed_provider,
        trimmed_secret,
    ));

    for service in services {
        if let Err(error) = delete_provider_secret_service(&service) {
            log::error!(
                "provider secret delete failed for provider='{}' key='{}' service='{}': {}",
                trimmed_provider,
                trimmed_secret,
                service,
                error
            );
            return Err(error);
        }
    }

    Ok(())
}

struct ResolvedPluginSupport {
    support_state: &'static str,
    support_message: Option<String>,
    is_surfaced: bool,
    probe_supported: bool,
}

fn plugin_support_for_current_platform(
    manifest: &plugin_engine::manifest::PluginManifest,
) -> ResolvedPluginSupport {
    if cfg!(target_os = "windows") {
        let windows = &manifest.platform_support.windows;
        let (support_state, probe_supported, default_message) = match windows.state {
            plugin_engine::manifest::WindowsSupportState::Supported => ("supported", true, None),
            plugin_engine::manifest::WindowsSupportState::Experimental => (
                "experimental",
                true,
                Some("Experimental on Windows.".to_string()),
            ),
            plugin_engine::manifest::WindowsSupportState::Blocked => (
                "comingSoonOnWindows",
                false,
                Some("Coming soon on Windows.".to_string()),
            ),
        };

        return ResolvedPluginSupport {
            support_state,
            support_message: windows.message.clone().or(default_message),
            is_surfaced: windows.surfaced,
            probe_supported,
        };
    }

    ResolvedPluginSupport {
        support_state: "supported",
        support_message: None,
        is_surfaced: true,
        probe_supported: true,
    }
}

fn plugin_is_probe_supported(manifest: &plugin_engine::manifest::PluginManifest) -> bool {
    plugin_support_for_current_platform(manifest).probe_supported
}

/// Update the global shortcut registration.
/// Pass `null` to disable the shortcut, or a shortcut string like "CommandOrControl+Shift+U".
#[cfg(desktop)]
#[tauri::command]
fn update_global_shortcut(
    app_handle: tauri::AppHandle,
    shortcut: Option<String>,
) -> Result<(), String> {
    let global_shortcut = app_handle.global_shortcut();
    let normalized_shortcut = shortcut.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let mut managed_shortcut = managed_shortcut_slot()
        .lock()
        .map_err(|e| format!("failed to lock managed shortcut state: {}", e))?;

    if *managed_shortcut == normalized_shortcut {
        log::debug!("Global shortcut unchanged");
        return Ok(());
    }

    let previous_shortcut = managed_shortcut.clone();
    if let Some(existing) = previous_shortcut.as_deref() {
        match global_shortcut.unregister(existing) {
            Ok(()) => {
                // Keep in-memory state aligned with actual registration state.
                *managed_shortcut = None;
            }
            Err(e) => {
                log::warn!(
                    "Failed to unregister existing shortcut '{}': {}",
                    existing,
                    e
                );
            }
        }
    }

    if let Some(shortcut) = normalized_shortcut {
        log::info!("Registering global shortcut: {}", shortcut);
        global_shortcut
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                handle_global_shortcut(app, event);
            })
            .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut, e))?;
        *managed_shortcut = Some(shortcut);
    } else {
        log::info!("Global shortcut disabled");
        *managed_shortcut = None;
    }

    Ok(())
}

#[tauri::command]
fn list_plugins(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            // Extract primary candidates: progress lines with primary_order, sorted by order
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            let support = plugin_support_for_current_platform(&plugin.manifest);

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                brand_color: plugin.manifest.brand_color,
                support_state: support.support_state.to_string(),
                support_message: support.support_message,
                is_surfaced: support.is_surfaced,
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                links: plugin
                    .manifest
                    .links
                    .iter()
                    .map(|link| PluginLinkDto {
                        label: link.label.clone(),
                        url: link.url.clone(),
                    })
                    .collect(),
                primary_candidates,
            }
        })
        .collect()
}

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
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            reposition_panel,
            show_panel_for_view,
            open_settings_window,
            open_devtools,
            start_probe_batch,
            list_plugins,
            get_log_path,
            set_provider_secret,
            delete_provider_secret,
            update_global_shortcut
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            {
                app_nap::disable_app_nap();
                webkit_config::disable_webview_suspension(app.handle());
            }

            use tauri::Manager;

            let version = app.package_info().version.to_string();
            log::info!("OpenUsage v{} starting", version);

            track_app_started_once_per_day_per_version(app);

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let resource_dir = app.path().resource_dir().expect("no resource dir");
            log::debug!("app_data_dir: {:?}", app_data_dir);

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir,
                app_version: app.package_info().version.to_string(),
            }));

            tray::create(app.handle())?;

            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Register global shortcut from stored settings
            #[cfg(desktop)]
            {
                use tauri_plugin_store::StoreExt;

                if let Ok(store) = app.handle().store("settings.json") {
                    if let Some(shortcut_value) = store.get(GLOBAL_SHORTCUT_STORE_KEY) {
                        if let Some(shortcut) = shortcut_value.as_str() {
                            let shortcut = shortcut.trim();
                            if !shortcut.is_empty() {
                                let handle = app.handle().clone();
                                log::info!("Registering initial global shortcut: {}", shortcut);
                                if let Err(e) = handle.global_shortcut().on_shortcut(
                                    shortcut,
                                    |app, _shortcut, event| {
                                        handle_global_shortcut(app, event);
                                    },
                                ) {
                                    log::warn!("Failed to register initial global shortcut: {}", e);
                                } else if let Ok(mut managed_shortcut) =
                                    managed_shortcut_slot().lock()
                                {
                                    *managed_shortcut = Some(shortcut.to_string());
                                } else {
                                    log::warn!("Failed to store managed shortcut in memory");
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}

#[cfg(test)]
mod tests {
    use super::{
        app_started_day_key, is_missing_credential_error, plugin_is_probe_supported,
        plugin_support_for_current_platform, provider_secret_service, should_track_app_started,
        verify_provider_secret_write_with_fresh_lookup,
    };
    use crate::plugin_engine::manifest::{
        PlatformSupport, PluginManifest, WindowsSupportConfig, WindowsSupportState,
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
            lines: Vec::new(),
            links: Vec::new(),
            platform_support: PlatformSupport {
                windows: WindowsSupportConfig {
                    state: windows_state,
                    surfaced,
                    message: message.map(|value| value.to_string()),
                },
            },
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
    fn provider_secret_write_verification_uses_fresh_lookup_service() {
        let service = provider_secret_service("ollama", "cookieHeader");
        let expected = "session=abc123";
        let mut seen_service = None;

        let result =
            verify_provider_secret_write_with_fresh_lookup(&service, expected, |service_name| {
                seen_service = Some(service_name.to_string());
                Ok(expected.to_string())
            });

        assert_eq!(result, Ok(()));
        assert_eq!(seen_service.as_deref(), Some(service.as_str()));
    }

    #[test]
    fn provider_secret_write_verification_rejects_fresh_lookup_mismatch() {
        let service = provider_secret_service("ollama", "cookieHeader");

        let result =
            verify_provider_secret_write_with_fresh_lookup(&service, "session=abc123", |_| {
                Ok("session=other".to_string())
            });

        assert_eq!(
            result,
            Err("credential read-after-write mismatch".to_string())
        );
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
