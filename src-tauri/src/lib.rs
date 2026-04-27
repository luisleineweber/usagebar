#[cfg(target_os = "macos")]
mod app_nap;
mod codex_account_store;
mod panel;
mod plugin_engine;
mod provider_secret_store;
mod settings_window;
mod tray;
#[cfg(target_os = "macos")]
mod webkit_config;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use base64::Engine;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::{Emitter, Manager};
use tauri_plugin_aptabase::EventTracker;
use tauri_plugin_log::{Target, TargetKind};
use uuid::Uuid;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const APP_STARTED_TRACKED_DAY_KEY_PREFIX: &str = "analytics.app_started_day.";
const PROVIDER_SECRET_KEYRING_TARGET: &str = "OpenUsage";
#[cfg(target_os = "windows")]
const PROVIDER_SECRET_WINDOWS_USER: &str = "provider-secret";

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ProviderSecretEntrySpec<'a> {
    target: Option<&'a str>,
    service: &'a str,
    user: &'a str,
}

fn provider_secret_service(provider_id: &str, secret_key: &str) -> String {
    format!("OpenUsage Provider Secret {} {}", provider_id, secret_key)
}

fn provider_secret_entry_spec(service: &str) -> ProviderSecretEntrySpec<'_> {
    #[cfg(target_os = "windows")]
    {
        return ProviderSecretEntrySpec {
            target: Some(service),
            service: PROVIDER_SECRET_KEYRING_TARGET,
            user: PROVIDER_SECRET_WINDOWS_USER,
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        ProviderSecretEntrySpec {
            target: None,
            service: PROVIDER_SECRET_KEYRING_TARGET,
            user: service,
        }
    }
}

#[cfg(target_os = "windows")]
fn provider_secret_legacy_entry_spec(service: &str) -> ProviderSecretEntrySpec<'_> {
    ProviderSecretEntrySpec {
        target: None,
        service: PROVIDER_SECRET_KEYRING_TARGET,
        user: service,
    }
}

fn open_provider_secret_entry(spec: ProviderSecretEntrySpec<'_>) -> Result<Entry, keyring::Error> {
    match spec.target {
        Some(target) => Entry::new_with_target(target, spec.service, spec.user),
        None => Entry::new(spec.service, spec.user),
    }
}

fn provider_display_name(provider_id: &str) -> String {
    match provider_id {
        "ollama" => "Ollama".to_string(),
        "opencode" => "OpenCode".to_string(),
        "codex" => "Codex".to_string(),
        "claude" => "Claude".to_string(),
        _ => provider_id.to_string(),
    }
}

fn provider_secret_field_label(secret_key: &str) -> &'static str {
    match secret_key {
        "cookieHeader" => "cookie header",
        _ => "secret",
    }
}

fn provider_secret_label(provider_id: &str, secret_key: &str) -> String {
    format!(
        "{} {}",
        provider_display_name(provider_id),
        provider_secret_field_label(secret_key)
    )
}

fn provider_secret_legacy_services(provider_id: &str, secret_key: &str) -> Vec<String> {
    match (provider_id, secret_key) {
        ("opencode", "cookieHeader") => vec!["OpenCode Cookie Header".to_string()],
        _ => Vec::new(),
    }
}

fn delete_provider_secret_service(service: &str) -> Result<(), String> {
    let mut specs = vec![provider_secret_entry_spec(service)];
    #[cfg(target_os = "windows")]
    {
        specs.push(provider_secret_legacy_entry_spec(service));
    }

    for spec in specs {
        let entry = open_provider_secret_entry(spec)
            .map_err(|error| format!("credential store unavailable: {}", error))?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(error) => {
                let message = error.to_string().to_lowercase();
                if is_missing_credential_error(&message) {
                    continue;
                }
                return Err(format!("credential delete failed: {}", error));
            }
        }
    }

    Ok(())
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

#[cfg(not(target_os = "windows"))]
fn read_provider_secret_service(
    provider_id: &str,
    secret_key: &str,
    service: &str,
) -> Result<String, String> {
    let label = provider_secret_label(provider_id, secret_key);
    let entry =
        open_provider_secret_entry(provider_secret_entry_spec(service)).map_err(|error| {
            format!(
                "Could not access the system credential vault for {}: {}",
                label, error
            )
        })?;
    entry.get_password().map_err(|error| {
        format!(
            "Saved {}, but could not read it back from a fresh system credential vault lookup: {}",
            label, error
        )
    })
}

fn verify_provider_secret_write_with_fresh_lookup<F>(
    provider_id: &str,
    secret_key: &str,
    service: &str,
    expected_value: &str,
    read_secret: F,
) -> Result<(), String>
where
    F: FnOnce(&str) -> Result<String, String>,
{
    let label = provider_secret_label(provider_id, secret_key);
    let read_back = read_secret(service)?;
    if read_back != expected_value {
        return Err(format!(
            "Saved {}, but the fresh system credential vault lookup returned a different value.",
            label
        ));
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

fn now_utc_unix_ms() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() * 1000
}

fn provider_config_file_paths(app_data_dir: &std::path::Path) -> [PathBuf; 2] {
    [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ]
}

fn load_provider_configs_json(app_data_dir: &std::path::Path) -> Result<serde_json::Map<String, JsonValue>, String> {
    for path in provider_config_file_paths(app_data_dir) {
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Could not read provider settings from {}: {}",
                    path.display(),
                    error
                ))
            }
        };

        let json: JsonValue =
            serde_json::from_str(&text).map_err(|error| format!("Could not parse provider settings: {}", error))?;
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
        JsonValue::String(inner) => try_parse_json_or_hex_json(&inner).or(Some(JsonValue::String(inner))),
        other => Some(other),
    }
}

fn json_string_field<'a>(object: &'a serde_json::Map<String, JsonValue>, key: &str) -> Option<&'a str> {
    object.get(key).and_then(JsonValue::as_str).map(str::trim).filter(|value| !value.is_empty())
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

fn read_codex_auth_from_path(path: &PathBuf) -> Result<Option<ResolvedCodexAuth>, String> {
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
                expanded,
                error
            ))
        }
    };

    Ok(json_string_or_object(&raw).and_then(normalize_codex_auth))
}

fn read_codex_auth_from_keychain() -> Result<Option<ResolvedCodexAuth>, String> {
    let entry =
        Entry::new("OpenUsage", "Codex Auth").map_err(|error| format!("Could not access Codex keychain entry: {}", error))?;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedCodexAccountResponse {
    profile: codex_account_store::CodexAccountProfile,
    was_first_profile: bool,
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
fn sync_panel_geometry(panel_height_px: f64) {
    panel::sync_panel_geometry(panel_height_px);
}

#[tauri::command]
fn apply_panel_bounds(app_handle: tauri::AppHandle, panel_height_px: f64) {
    panel::apply_panel_bounds(&app_handle, panel_height_px);
}

#[tauri::command]
fn take_pending_panel_view() -> Option<String> {
    take_pending_panel_view_inner()
}

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

#[tauri::command]
fn show_panel_for_view(app_handle: tauri::AppHandle, view: String) -> Result<(), String> {
    let normalized_view = view.trim().to_string();
    if normalized_view.is_empty() {
        return Err("view must not be empty".to_string());
    }

    store_pending_panel_view(normalized_view.clone());
    panel::reposition_panel(&app_handle, None);
    panel::show_panel(&app_handle);
    app_handle
        .emit_to("main", "tray:navigate", normalized_view)
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
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version, Some(&handle))
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
    app_handle: tauri::AppHandle,
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
    let label = provider_secret_label(trimmed_provider, trimmed_secret);
    let app_data_dir = app_handle.path().app_data_dir().map_err(|error| {
        format!(
            "Could not access the app data directory for {}: {}",
            label, error
        )
    })?;
    log::info!(
        "setting provider secret for provider='{}' key='{}'",
        trimmed_provider,
        trimmed_secret
    );

    #[cfg(target_os = "windows")]
    {
        provider_secret_store::save_provider_secret(
            &app_data_dir,
            trimmed_provider,
            trimmed_secret,
            trimmed_value,
        )
        .map_err(|error| {
            format!(
                "Could not save {} to the Windows-protected local secret store: {}",
                label, error
            )
        })?;

        verify_provider_secret_write_with_fresh_lookup(
            trimmed_provider,
            trimmed_secret,
            &service,
            trimmed_value,
            |_| {
                provider_secret_store::read_provider_secret(
                    &app_data_dir,
                    trimmed_provider,
                    trimmed_secret,
                )?
                .ok_or_else(|| {
                    format!(
                        "Saved {}, but it was missing from the Windows-protected local secret store on the next read.",
                        label
                    )
                })
            },
        )?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let entry =
            open_provider_secret_entry(provider_secret_entry_spec(&service)).map_err(|error| {
                format!(
                    "Could not access the system credential vault for {}: {}",
                    label, error
                )
            })?;

        entry.set_password(trimmed_value).map_err(|error| {
            format!(
                "Could not save {} to the system credential vault: {}",
                label, error
            )
        })?;

        return verify_provider_secret_write_with_fresh_lookup(
            trimmed_provider,
            trimmed_secret,
            &service,
            trimmed_value,
            |service| read_provider_secret_service(trimmed_provider, trimmed_secret, service),
        );
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
fn delete_provider_secret(
    app_handle: tauri::AppHandle,
    provider_id: String,
    secret_key: String,
) -> Result<(), String> {
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

    #[cfg(target_os = "windows")]
    {
        let app_data_dir = app_handle.path().app_data_dir().map_err(|error| {
            format!(
                "Could not access the app data directory while removing {}: {}",
                provider_secret_label(trimmed_provider, trimmed_secret),
                error
            )
        })?;

        provider_secret_store::delete_provider_secret(
            &app_data_dir,
            trimmed_provider,
            trimmed_secret,
        )
        .map_err(|error| {
            format!(
                "Could not remove {} from the Windows-protected local secret store: {}",
                provider_secret_label(trimmed_provider, trimmed_secret),
                error
            )
        })?;
    }

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

#[tauri::command]
fn list_codex_account_profiles(
    app_handle: tauri::AppHandle,
) -> Result<Vec<codex_account_store::CodexAccountProfile>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    codex_account_store::list_profiles(&app_data_dir)
}

#[tauri::command]
fn import_current_codex_account_profile(
    app_handle: tauri::AppHandle,
) -> Result<ImportedCodexAccountResponse, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    let existing_profiles = codex_account_store::list_profiles(&app_data_dir)?;
    let resolved = resolve_current_codex_auth()?;
    let now_ms = now_utc_unix_ms();
    let imported = codex_account_store::ImportedCodexAccount {
        label: codex_profile_label(resolved.email.as_deref(), resolved.account_id.as_deref(), now_ms),
        email: resolved.email.clone(),
        account_id: resolved.account_id.clone(),
    };
    let profile = codex_account_store::import_profile(&app_data_dir, imported, now_ms)?;
    let secret_key = format!("account:{}:authJson", profile.profile_id);

    #[cfg(target_os = "windows")]
    provider_secret_store::save_provider_secret(&app_data_dir, "codex", &secret_key, &resolved.auth_json)
        .map_err(|error| format!("Could not save imported Codex profile auth: {}", error))?;

    #[cfg(not(target_os = "windows"))]
    {
        let service = provider_secret_service("codex", &secret_key);
        let entry = open_provider_secret_entry(provider_secret_entry_spec(&service))
            .map_err(|error| format!("Could not access the system credential vault: {}", error))?;
        entry
            .set_password(&resolved.auth_json)
            .map_err(|error| format!("Could not save imported Codex profile auth: {}", error))?;
    }

    Ok(ImportedCodexAccountResponse {
        profile,
        was_first_profile: existing_profiles.is_empty(),
    })
}

#[tauri::command]
fn delete_codex_account_profile(
    app_handle: tauri::AppHandle,
    profile_id: String,
) -> Result<Option<codex_account_store::CodexAccountProfile>, String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("profile id is required".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    let removed = codex_account_store::delete_profile(&app_data_dir, trimmed_profile_id)?;
    if removed.is_none() {
        return Ok(None);
    }

    let secret_key = format!("account:{}:authJson", trimmed_profile_id);
    #[cfg(target_os = "windows")]
    provider_secret_store::delete_provider_secret(&app_data_dir, "codex", &secret_key)
        .map_err(|error| format!("Could not remove imported Codex profile auth: {}", error))?;

    let service = provider_secret_service("codex", &secret_key);
    delete_provider_secret_service(&service)
        .map_err(|error| format!("Could not remove imported Codex profile auth: {}", error))?;

    if let Some(selected_profile_id) = read_provider_config_string(&app_data_dir, "codex", "selectedAccountProfileId")? {
        if selected_profile_id.trim() == trimmed_profile_id {
            log::info!(
                "deleted selected Codex profile '{}'; UI should clear selectedAccountProfileId on next settings load",
                trimmed_profile_id
            );
        }
    }

    Ok(removed)
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
            sync_panel_geometry,
            apply_panel_bounds,
            take_pending_panel_view,
            sync_panel_view,
            show_panel_for_view,
            open_settings_window,
            open_devtools,
            start_probe_batch,
            list_plugins,
            get_log_path,
            set_provider_secret,
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
        plugin_support_for_current_platform, provider_secret_entry_spec, provider_secret_label,
        provider_secret_service, should_track_app_started, store_pending_panel_view,
        take_pending_panel_view_inner, verify_provider_secret_write_with_fresh_lookup,
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
