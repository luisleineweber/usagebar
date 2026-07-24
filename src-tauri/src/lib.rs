#![cfg_attr(test, allow(dead_code, unused_imports))]

#[cfg(target_os = "macos")]
mod app_nap;
mod atomic_file;
mod browser_cookie_import;
pub mod cli;
mod codex_account_store;
#[cfg(not(test))]
mod credential_commands;
mod dev_data_migration;
mod local_http_api;
#[cfg(not(test))]
mod panel;
mod plugin_engine;
#[cfg(not(test))]
mod probe_commands;
mod probe_coordinator;
mod provider_secrets;
mod provider_secret_store;
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

use base64::Engine;
use keyring::Entry;
use serde::Serialize;
use serde_json::Value as JsonValue;
pub(crate) use provider_secrets::*;
#[cfg(not(test))]
use tauri::{Emitter, Manager};
#[cfg(not(test))]
use tauri_plugin_aptabase::EventTracker;
#[cfg(not(test))]
use tauri_plugin_log::{Target, TargetKind};

#[cfg(all(desktop, not(test)))]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg(not(test))]
use credential_commands::{
    capture_provider_cookie_header, delete_codex_account_profile, delete_provider_secret,
    import_browser_cookies, import_current_codex_account_profile, list_browser_import_sources,
    list_codex_account_profiles, set_provider_secret,
};
#[cfg(not(test))]
use probe_commands::start_probe_batch;

#[cfg(not(test))]
const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const APP_STARTED_TRACKED_DAY_KEY_PREFIX: &str = "analytics.app_started_day.";
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

fn now_utc_unix_ms() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() * 1000
}

fn provider_config_file_paths(app_data_dir: &std::path::Path) -> [PathBuf; 2] {
    [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ]
}

fn load_provider_configs_json(
    app_data_dir: &std::path::Path,
) -> Result<serde_json::Map<String, JsonValue>, String> {
    for path in provider_config_file_paths(app_data_dir) {
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Could not read provider settings from {}: {}",
                    path.display(),
                    error
                ));
            }
        };

        let json: JsonValue = serde_json::from_str(&text)
            .map_err(|error| format!("Could not parse provider settings: {}", error))?;
        let configs = json
            .get("providerConfigs")
            .and_then(JsonValue::as_object)
            .cloned()
            .unwrap_or_default();
        return Ok(configs);
    }

    Ok(serde_json::Map::new())
}

fn read_provider_config_string(
    app_data_dir: &std::path::Path,
    provider_id: &str,
    key: &str,
) -> Result<Option<String>, String> {
    let configs = load_provider_configs_json(app_data_dir)?;
    Ok(configs
        .get(provider_id)
        .and_then(JsonValue::as_object)
        .and_then(|config| config.get(key))
        .and_then(JsonValue::as_str)
        .map(str::to_string))
}

struct GuidedCookiePolicy {
    login_url: &'static str,
    success_url_contains: &'static str,
    cookie_urls: &'static [&'static str],
    cookie_names: &'static [&'static str],
}

fn guided_cookie_policy(provider_id: &str) -> Option<GuidedCookiePolicy> {
    match provider_id.trim() {
        "zed" => Some(GuidedCookiePolicy {
            login_url: "https://dashboard.zed.dev/account",
            success_url_contains: "/billing/usage",
            cookie_urls: &[
                "https://dashboard.zed.dev/account",
                "https://cloud.zed.dev/frontend/billing/usage",
            ],
            cookie_names: &["zed.session", "c15t"],
        }),
        "abacus" => Some(GuidedCookiePolicy {
            login_url: "https://apps.abacus.ai/chatllm/admin/compute-points-usage",
            success_url_contains: "/chatllm/admin/compute-points-usage",
            cookie_urls: &["https://apps.abacus.ai/chatllm/admin/compute-points-usage"],
            cookie_names: &["sessionid", "session_token"],
        }),
        "perplexity" => Some(GuidedCookiePolicy {
            login_url: "https://www.perplexity.ai/account/details",
            success_url_contains: "/account/details",
            cookie_urls: &["https://www.perplexity.ai/rest/billing/credits"],
            cookie_names: &["__Secure-next-auth.session-token", "pplx_session"],
        }),
        "opencode" => Some(GuidedCookiePolicy {
            login_url: "https://opencode.ai/",
            success_url_contains: "/workspace/",
            cookie_urls: &["https://opencode.ai/"],
            cookie_names: &["auth", "__Host-auth"],
        }),
        _ => None,
    }
}

fn validate_guided_cookie_capture_request(
    provider_id: &str,
    login_url: &str,
    success_url_contains: &str,
    cookie_urls: &[String],
) -> Result<(), String> {
    let provider_id = provider_id.trim();
    let login_url = login_url.trim();
    let success_url_contains = success_url_contains.trim();

    let Some(policy) = guided_cookie_policy(provider_id) else {
        return Err(format!(
            "guided cookie login is not enabled for provider '{}'",
            provider_id
        ));
    };
    if login_url != policy.login_url {
        return Err(format!("{} guided login URL is not allowed", provider_id));
    }
    if success_url_contains != policy.success_url_contains {
        return Err(format!(
            "{} guided login success marker is not allowed",
            provider_id
        ));
    }
    if cookie_urls.len() != policy.cookie_urls.len()
        || cookie_urls
            .iter()
            .zip(policy.cookie_urls)
            .any(|(actual, allowed)| actual.trim() != *allowed)
    {
        return Err(format!(
            "{} guided login cookie URLs are not allowed",
            provider_id
        ));
    }
    Ok(())
}

fn try_parse_json_or_hex_json(text: &str) -> Option<JsonValue> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(json) = serde_json::from_str(trimmed) {
        return Some(json);
    }

    let hex = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
        .unwrap_or(trimmed);
    if hex.is_empty() || hex.len() % 2 != 0 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let bytes: Vec<u8> = (0..hex.len())
        .step_by(2)
        .filter_map(|index| u8::from_str_radix(&hex[index..index + 2], 16).ok())
        .collect();
    if bytes.len() * 2 != hex.len() {
        return None;
    }
    let decoded = String::from_utf8(bytes).ok()?;
    serde_json::from_str(&decoded).ok()
}

fn json_string_or_object(text: &str) -> Option<JsonValue> {
    let parsed = try_parse_json_or_hex_json(text)?;
    match parsed {
        JsonValue::String(inner) => {
            try_parse_json_or_hex_json(&inner).or(Some(JsonValue::String(inner)))
        }
        other => Some(other),
    }
}

fn json_string_field<'a>(
    object: &'a serde_json::Map<String, JsonValue>,
    key: &str,
) -> Option<&'a str> {
    object
        .get(key)
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn decode_base64url_to_json(token: &str) -> Option<JsonValue> {
    let payload = token.split('.').nth(1)?;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&decoded).ok()
}

#[derive(Debug, Clone)]
struct ResolvedCodexAuth {
    auth_json: String,
    email: Option<String>,
    account_id: Option<String>,
}

fn resolve_codex_home_from_env() -> Option<String> {
    let value = std::env::var("CODEX_HOME").ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn codex_auth_paths() -> Vec<PathBuf> {
    if let Some(home) = resolve_codex_home_from_env() {
        return vec![PathBuf::from(home).join("auth.json")];
    }

    vec![
        PathBuf::from("~/.config/codex/auth.json"),
        PathBuf::from("~/.codex/auth.json"),
    ]
}

fn normalize_codex_auth(json: JsonValue) -> Option<ResolvedCodexAuth> {
    let auth = match json {
        JsonValue::Object(map) => map,
        _ => return None,
    };

    let tokens = auth.get("tokens").and_then(JsonValue::as_object);
    let access_token = tokens
        .and_then(|tokens| json_string_field(tokens, "access_token"))
        .map(str::to_string);
    let refresh_token = tokens
        .and_then(|tokens| json_string_field(tokens, "refresh_token"))
        .map(str::to_string);
    let api_key = json_string_field(&auth, "OPENAI_API_KEY").map(str::to_string);

    if access_token.is_none() && refresh_token.is_none() && api_key.is_none() {
        return None;
    }

    let account_id = tokens
        .and_then(|tokens| json_string_field(tokens, "account_id"))
        .map(str::to_string);

    let token_for_identity = tokens
        .and_then(|tokens| json_string_field(tokens, "id_token"))
        .or_else(|| tokens.and_then(|tokens| json_string_field(tokens, "access_token")));
    let token_payload = token_for_identity.and_then(decode_base64url_to_json);
    let email = token_payload
        .as_ref()
        .and_then(JsonValue::as_object)
        .and_then(|payload| {
            payload
                .get("email")
                .and_then(JsonValue::as_str)
                .or_else(|| payload.get("upn").and_then(JsonValue::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let account_id = account_id.or_else(|| {
        token_payload
            .as_ref()
            .and_then(JsonValue::as_object)
            .and_then(|payload| {
                payload
                    .get("account_id")
                    .and_then(JsonValue::as_str)
                    .or_else(|| payload.get("accountId").and_then(JsonValue::as_str))
                    .or_else(|| payload.get("sub").and_then(JsonValue::as_str))
            })
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    });

    let auth_json = serde_json::to_string_pretty(&JsonValue::Object(auth)).ok()?;
    Some(ResolvedCodexAuth {
        auth_json,
        email,
        account_id,
    })
}

fn read_codex_auth_from_path(path: &std::path::Path) -> Result<Option<ResolvedCodexAuth>, String> {
    let raw_path = path.to_string_lossy().to_string();
    let expanded = if raw_path == "~" {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("~"))
            .to_string_lossy()
            .to_string()
    } else if let Some(rest) = raw_path.strip_prefix("~/") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("~"))
            .join(rest)
            .to_string_lossy()
            .to_string()
    } else {
        raw_path
    };
    let raw = match std::fs::read_to_string(&expanded) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Could not read Codex auth file {}: {}",
                expanded, error
            ));
        }
    };

    Ok(json_string_or_object(&raw).and_then(normalize_codex_auth))
}

fn read_codex_auth_from_keychain() -> Result<Option<ResolvedCodexAuth>, String> {
    let entry = Entry::new("OpenUsage", "Codex Auth")
        .map_err(|error| format!("Could not access Codex keychain entry: {}", error))?;

    match entry.get_password() {
        Ok(value) => Ok(json_string_or_object(&value).and_then(normalize_codex_auth)),
        Err(error) => {
            let message = error.to_string();
            if is_missing_credential_error(&message) {
                Ok(None)
            } else {
                Err(format!("Could not read Codex keychain entry: {}", error))
            }
        }
    }
}

fn resolve_current_codex_auth() -> Result<ResolvedCodexAuth, String> {
    for path in codex_auth_paths() {
        if let Some(auth) = read_codex_auth_from_path(&path)? {
            return Ok(auth);
        }
    }

    if let Some(auth) = read_codex_auth_from_keychain()? {
        return Ok(auth);
    }

    Err("No current Codex login was found. Run `codex` on this machine first.".to_string())
}

fn codex_profile_label(email: Option<&str>, account_id: Option<&str>, now_ms: i64) -> String {
    if let Some(email) = email {
        return email.to_string();
    }
    if let Some(account_id) = account_id {
        return format!("Codex {}", account_id);
    }
    format!("Codex {}", now_ms)
}

fn should_track_app_started(last_tracked_day: Option<&str>, today: &str) -> bool {
    match last_tracked_day {
        Some(day) => day != today,
        None => true,
    }
}

#[cfg(all(desktop, not(test)))]
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

#[cfg(all(not(desktop), not(test)))]
fn track_app_started_once_per_day_per_version(app: &tauri::App) {
    let _ = app.track_event("app_started", None);
}

#[cfg(all(desktop, not(test)))]
fn managed_shortcut_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Shared shortcut handler that toggles the panel when the shortcut is pressed.
#[cfg(all(desktop, not(test)))]
fn handle_global_shortcut(
    app: &tauri::AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state == ShortcutState::Pressed {
        log::debug!("Global shortcut triggered");
        panel::toggle_panel(app);
    }
}

#[cfg(not(test))]
pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
    pub probe_coordinator: Arc<Mutex<probe_coordinator::ProbeCoordinator>>,
}

#[cfg(not(test))]
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
    pub status_page_url: Option<String>,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[cfg(not(test))]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
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
#[cfg(all(desktop, not(test)))]
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

#[cfg(not(test))]
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
                status_page_url: plugin
                    .manifest
                    .links
                    .iter()
                    .find(|link| link.label.eq_ignore_ascii_case("status"))
                    .map(|link| link.url.clone()),
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
            log::info!("UsageBar v{} starting", version);

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            match dev_data_migration::migrate_for_dev(&app_data_dir) {
                Ok(report) if report.copied_files > 0 => {
                    log::info!(
                        "Migrated {} Alpha 5 data file(s) into local Alpha 6 data",
                        report.copied_files
                    );
                }
                Ok(_) => {}
                Err(error) => log::warn!("Could not migrate local Alpha 5 data: {}", error),
            }

            track_app_started_once_per_day_per_version(app);

            let resource_dir = app.path().resource_dir().expect("no resource dir");
            log::debug!("app_data_dir: {:?}", app_data_dir);

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            let known_plugin_ids = plugins
                .iter()
                .map(|plugin| plugin.manifest.id.clone())
                .collect();
            local_http_api::init(&app_data_dir, known_plugin_ids);
            local_http_api::start_server();

            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir,
                app_version: app.package_info().version.to_string(),
                probe_coordinator: Arc::new(Mutex::new(
                    probe_coordinator::ProbeCoordinator::default(),
                )),
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
            lines: Vec::new(),
            links: Vec::new(),
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
