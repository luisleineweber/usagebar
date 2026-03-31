use crate::provider_secret_store;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use keyring::Entry;
use rquickjs::{Ctx, Exception, Function, Object};
use rusqlite::{Connection, OpenFlags, types::ValueRef};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

const WHITELISTED_ENV_VARS: [&str; 21] = [
    "CODEX_HOME",
    "GH_CONFIG_DIR",
    "KILO_API_KEY",
    "KIMI_K2_API_KEY",
    "KIMI_API_KEY",
    "KIMI_KEY",
    "ZAI_API_KEY",
    "GLM_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_API_TOKEN",
    "MINIMAX_CN_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_API_URL",
    "OPENCODE_COOKIE_HEADER",
    "OPENCODE_WORKSPACE_ID",
    "PERPLEXITY_COOKIE_HEADER",
    "PERPLEXITY_COOKIE",
    "PERPLEXITY_SESSION_TOKEN",
    "SYNTHETIC_API_KEY",
    "WARP_API_KEY",
    "WARP_TOKEN",
];
const KEYRING_TARGET: &str = "OpenUsage";
#[cfg(target_os = "windows")]
const PROVIDER_SECRET_WINDOWS_USER: &str = "provider-secret";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Copy)]
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
            service: KEYRING_TARGET,
            user: PROVIDER_SECRET_WINDOWS_USER,
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        ProviderSecretEntrySpec {
            target: None,
            service: KEYRING_TARGET,
            user: service,
        }
    }
}

#[cfg(target_os = "windows")]
fn provider_secret_legacy_entry_spec(service: &str) -> ProviderSecretEntrySpec<'_> {
    ProviderSecretEntrySpec {
        target: None,
        service: KEYRING_TARGET,
        user: service,
    }
}

fn open_provider_secret_entry(spec: ProviderSecretEntrySpec<'_>) -> Result<Entry, keyring::Error> {
    match spec.target {
        Some(target) => Entry::new_with_target(target, spec.service, spec.user),
        None => Entry::new(spec.service, spec.user),
    }
}

fn provider_secret_legacy_services(provider_id: &str, secret_key: &str) -> Vec<String> {
    match (provider_id, secret_key) {
        ("opencode", "cookieHeader") => vec!["OpenCode Cookie Header".to_string()],
        _ => Vec::new(),
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

fn last_non_empty_trimmed_line(text: &str) -> Option<String> {
    text.lines()
        .map(|line| line.trim())
        .rev()
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

fn configure_background_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn read_env_from_process(name: &str) -> Option<String> {
    let value = std::env::var(name).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_env_value_via_command(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    configure_background_command(&mut command);
    let output = command.args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    last_non_empty_trimmed_line(&stdout)
}

fn terminal_env_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn shell_from_env() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let trimmed = shell.trim();
    if trimmed.is_empty() {
        return None;
    }
    let file = std::path::Path::new(trimmed).file_name()?.to_string_lossy();
    let allowed = file == "zsh" || file == "bash" || file == "fish";
    if allowed {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn read_env_from_interactive_shell(program: &str, name: &str) -> Option<String> {
    let script = format!("printenv {}", name);
    read_env_value_via_command(program, &["-ilc", script.as_str()])
}

fn read_env_from_interactive_shells(name: &str) -> Option<String> {
    let mut programs: Vec<String> = Vec::new();

    if let Some(shell) = shell_from_env() {
        programs.push(shell);
    }

    for program in [
        "/bin/zsh",
        "/bin/bash",
        "/opt/homebrew/bin/fish",
        "/usr/local/bin/fish",
        "/opt/local/bin/fish",
    ] {
        if !programs.iter().any(|p| p == program) {
            programs.push(program.to_string());
        }
    }

    for program in programs {
        if let Some(value) = read_env_from_interactive_shell(program.as_str(), name) {
            return Some(value);
        }
    }

    None
}

fn resolve_env_value(name: &str) -> Option<String> {
    // Prefer the current process env (fast + supports launchctl/terminal-launch).
    if let Some(value) = read_env_from_process(name) {
        return Some(value);
    }

    if let Ok(cache) = terminal_env_cache().lock() {
        if let Some(cached) = cache.get(name) {
            return cached.clone();
        }
    }

    let resolved = read_env_from_interactive_shells(name);
    if let Ok(mut cache) = terminal_env_cache().lock() {
        cache.insert(name.to_string(), resolved.clone());
    }
    resolved
}

fn decrypt_aes256_gcm_internal(envelope: &str, key_b64: &str) -> Result<String, String> {
    let key = base64::engine::general_purpose::STANDARD
        .decode(key_b64.trim())
        .map_err(|error| format!("invalid base64 key: {}", error))?;
    if key.len() != 32 {
        return Err("AES-256-GCM key must decode to 32 bytes".to_string());
    }

    let envelope_json: JsonValue = serde_json::from_str(envelope.trim())
        .map_err(|error| format!("invalid crypto envelope: {}", error))?;
    let nonce_b64 = envelope_json
        .get("nonce")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| "crypto envelope missing nonce".to_string())?;
    let ciphertext_b64 = envelope_json
        .get("ciphertext")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| "crypto envelope missing ciphertext".to_string())?;

    let nonce_bytes = base64::engine::general_purpose::STANDARD
        .decode(nonce_b64.trim())
        .map_err(|error| format!("invalid nonce encoding: {}", error))?;
    if nonce_bytes.len() != 12 {
        return Err("AES-256-GCM nonce must decode to 12 bytes".to_string());
    }

    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64.trim())
        .map_err(|error| format!("invalid ciphertext encoding: {}", error))?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| format!("invalid AES-256-GCM key: {}", error))?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|_| "AES-256-GCM decrypt failed".to_string())?;

    String::from_utf8(plaintext).map_err(|error| format!("decrypted text was not UTF-8: {}", error))
}

fn encrypt_aes256_gcm_internal(plaintext: &str, key_b64: &str) -> Result<String, String> {
    let key = base64::engine::general_purpose::STANDARD
        .decode(key_b64.trim())
        .map_err(|error| format!("invalid base64 key: {}", error))?;
    if key.len() != 32 {
        return Err("AES-256-GCM key must decode to 32 bytes".to_string());
    }

    let nonce_uuid = uuid::Uuid::new_v4();
    let nonce_bytes = &nonce_uuid.as_bytes()[..12];
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|error| format!("invalid AES-256-GCM key: {}", error))?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(nonce_bytes), plaintext.as_bytes())
        .map_err(|_| "AES-256-GCM encrypt failed".to_string())?;

    serde_json::to_string(&serde_json::json!({
        "nonce": base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        "ciphertext": base64::engine::general_purpose::STANDARD.encode(ciphertext),
    }))
    .map_err(|error| format!("failed to encode crypto envelope: {}", error))
}

/// Redact sensitive value to first4...last4 format (UTF-8 safe)
fn redact_value(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= 12 {
        "[REDACTED]".to_string()
    } else {
        let first4: String = chars.iter().take(4).collect();
        let last4: String = chars
            .iter()
            .rev()
            .take(4)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("{}...{}", first4, last4)
    }
}

/// Redact sensitive query parameters in URL
fn redact_url(url: &str) -> String {
    let sensitive_params = [
        "key",
        "api_key",
        "apikey",
        "token",
        "access_token",
        "secret",
        "password",
        "auth",
        "authorization",
        "bearer",
        "credential",
        "user",
        "user_id",
        "userid",
        "account_id",
        "accountid",
        "email",
        "login",
    ];

    if let Some(query_start) = url.find('?') {
        let (base, query) = url.split_at(query_start + 1);
        let redacted_params: Vec<String> = query
            .split('&')
            .map(|param| {
                if let Some(eq_pos) = param.find('=') {
                    let (name, value) = param.split_at(eq_pos);
                    let value = &value[1..]; // skip '='
                    let name_lower = name.to_lowercase();
                    if sensitive_params.iter().any(|s| name_lower.contains(s)) && !value.is_empty()
                    {
                        format!("{}={}", name, redact_value(value))
                    } else {
                        param.to_string()
                    }
                } else {
                    param.to_string()
                }
            })
            .collect();
        format!("{}{}", base, redacted_params.join("&"))
    } else {
        url.to_string()
    }
}

/// Redact sensitive patterns in response body for logging
fn redact_body(body: &str) -> String {
    let mut result = body.to_string();

    // Redact JWTs (eyJ... pattern with dots)
    let jwt_pattern =
        regex_lite::Regex::new(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+").unwrap();
    result = jwt_pattern
        .replace_all(&result, |caps: &regex_lite::Captures| {
            redact_value(&caps[0])
        })
        .to_string();

    // Redact common API key patterns (sk-xxx, pk-xxx, api_xxx, etc.)
    let api_key_pattern =
        regex_lite::Regex::new(r#"["']?(sk-|pk-|api_|key_|secret_)[A-Za-z0-9_-]{12,}["']?"#)
            .unwrap();
    result = api_key_pattern
        .replace_all(&result, |caps: &regex_lite::Captures| {
            let key = caps[0].trim_matches(|c| c == '"' || c == '\'');
            redact_value(key)
        })
        .to_string();

    // Redact JSON values for sensitive keys
    let sensitive_keys = [
        "name",
        "password",
        "token",
        "access_token",
        "refresh_token",
        "secret",
        "api_key",
        "apiKey",
        "authorization",
        "bearer",
        "credential",
        "session_token",
        "sessionToken",
        "auth_token",
        "authToken",
        "id_token",
        "idToken",
        "accessToken",
        "refreshToken",
        "user_id",
        "userId",
        "account_id",
        "accountId",
        "email",
        "login",
        "analytics_tracking_id",
    ];
    for key in sensitive_keys {
        // Match "key": "value" or "key":"value"
        let pattern = format!(r#""{}":\s*"([^"]+)""#, key);
        if let Ok(re) = regex_lite::Regex::new(&pattern) {
            result = re
                .replace_all(&result, |caps: &regex_lite::Captures| {
                    let value = &caps[1];
                    format!("\"{}\": \"{}\"", key, redact_value(value))
                })
                .to_string();
        }
    }

    result
}

/// Lightweight redaction for plugin log messages (JWT + API key patterns only).
fn redact_log_message(msg: &str) -> String {
    let mut result = msg.to_string();
    if let Ok(jwt_re) = regex_lite::Regex::new(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
    {
        result = jwt_re
            .replace_all(&result, |caps: &regex_lite::Captures| {
                redact_value(&caps[0])
            })
            .to_string();
    }
    if let Ok(api_re) = regex_lite::Regex::new(r#"(sk-|pk-|api_|key_|secret_)[A-Za-z0-9_-]{12,}"#) {
        result = api_re
            .replace_all(&result, |caps: &regex_lite::Captures| {
                redact_value(&caps[0])
            })
            .to_string();
    }
    result
}

pub fn inject_host_api<'js>(
    ctx: &Ctx<'js>,
    plugin_id: &str,
    app_data_dir: &PathBuf,
    app_version: &str,
) -> rquickjs::Result<()> {
    let globals = ctx.globals();
    let probe_ctx = Object::new(ctx.clone())?;

    probe_ctx.set("nowIso", iso_now())?;

    let app_obj = Object::new(ctx.clone())?;
    app_obj.set("version", app_version)?;
    app_obj.set("platform", std::env::consts::OS)?;
    app_obj.set("appDataDir", app_data_dir.to_string_lossy().to_string())?;
    let plugin_data_dir = app_data_dir.join("plugins_data").join(plugin_id);
    if let Err(err) = std::fs::create_dir_all(&plugin_data_dir) {
        log::warn!(
            "[plugin:{}] failed to create plugin data dir: {}",
            plugin_id,
            err
        );
    }
    app_obj.set(
        "pluginDataDir",
        plugin_data_dir.to_string_lossy().to_string(),
    )?;
    probe_ctx.set("app", app_obj)?;

    let host = Object::new(ctx.clone())?;
    inject_log(ctx, &host, plugin_id)?;
    inject_fs(ctx, &host)?;
    inject_crypto(ctx, &host)?;
    inject_env(ctx, &host, plugin_id)?;
    inject_provider_config(ctx, &host, plugin_id, app_data_dir)?;
    inject_http(ctx, &host, plugin_id)?;
    inject_keychain(ctx, &host)?;
    inject_gh(ctx, &host)?;
    inject_provider_secrets(ctx, &host, plugin_id, app_data_dir)?;
    inject_sqlite(ctx, &host)?;
    inject_ls(ctx, &host, plugin_id)?;
    inject_ccusage(ctx, &host, plugin_id)?;

    probe_ctx.set("host", host)?;
    globals.set("__openusage_ctx", probe_ctx)?;

    Ok(())
}

fn inject_crypto<'js>(ctx: &Ctx<'js>, host: &Object<'js>) -> rquickjs::Result<()> {
    let crypto_obj = Object::new(ctx.clone())?;

    crypto_obj.set(
        "decryptAes256Gcm",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, envelope: String, key_b64: String| -> rquickjs::Result<String> {
                decrypt_aes256_gcm_internal(&envelope, &key_b64)
                    .map_err(|error| Exception::throw_message(&ctx_inner, &error))
            },
        )?,
    )?;

    crypto_obj.set(
        "encryptAes256Gcm",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, plaintext: String, key_b64: String| -> rquickjs::Result<String> {
                encrypt_aes256_gcm_internal(&plaintext, &key_b64)
                    .map_err(|error| Exception::throw_message(&ctx_inner, &error))
            },
        )?,
    )?;

    host.set("crypto", crypto_obj)?;
    Ok(())
}

fn inject_log<'js>(ctx: &Ctx<'js>, host: &Object<'js>, plugin_id: &str) -> rquickjs::Result<()> {
    let log_obj = Object::new(ctx.clone())?;

    let pid = plugin_id.to_string();
    log_obj.set(
        "info",
        Function::new(ctx.clone(), move |msg: String| {
            log::info!("[plugin:{}] {}", pid, redact_log_message(&msg));
        })?,
    )?;

    let pid = plugin_id.to_string();
    log_obj.set(
        "warn",
        Function::new(ctx.clone(), move |msg: String| {
            log::warn!("[plugin:{}] {}", pid, redact_log_message(&msg));
        })?,
    )?;

    let pid = plugin_id.to_string();
    log_obj.set(
        "error",
        Function::new(ctx.clone(), move |msg: String| {
            log::error!("[plugin:{}] {}", pid, redact_log_message(&msg));
        })?,
    )?;

    host.set("log", log_obj)?;
    Ok(())
}

fn inject_fs<'js>(ctx: &Ctx<'js>, host: &Object<'js>) -> rquickjs::Result<()> {
    let fs_obj = Object::new(ctx.clone())?;

    fs_obj.set(
        "exists",
        Function::new(ctx.clone(), move |path: String| -> bool {
            let expanded = expand_path(&path);
            std::path::Path::new(&expanded).exists()
        })?,
    )?;

    fs_obj.set(
        "readText",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, path: String| -> rquickjs::Result<String> {
                let expanded = expand_path(&path);
                std::fs::read_to_string(&expanded)
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))
            },
        )?,
    )?;

    fs_obj.set(
        "writeText",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, path: String, content: String| -> rquickjs::Result<()> {
                let expanded = expand_path(&path);
                std::fs::write(&expanded, &content)
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))
            },
        )?,
    )?;

    fs_obj.set(
        "listDir",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, path: String| -> rquickjs::Result<Vec<String>> {
                let expanded = expand_path(&path);
                let entries = std::fs::read_dir(&expanded)
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))?;

                let mut names = Vec::new();
                for entry in entries {
                    let entry = match entry {
                        Ok(entry) => entry,
                        Err(_) => continue,
                    };
                    let name_os = entry.file_name();
                    let name = name_os.to_string_lossy().to_string();
                    if !name.is_empty() {
                        names.push(name);
                    }
                }
                names.sort();
                Ok(names)
            },
        )?,
    )?;

    host.set("fs", fs_obj)?;
    Ok(())
}

fn inject_env<'js>(ctx: &Ctx<'js>, host: &Object<'js>, _plugin_id: &str) -> rquickjs::Result<()> {
    let env_obj = Object::new(ctx.clone())?;
    env_obj.set(
        "get",
        Function::new(ctx.clone(), move |name: String| -> Option<String> {
            if !WHITELISTED_ENV_VARS.contains(&name.as_str()) {
                return None;
            }

            resolve_env_value(&name)
        })?,
    )?;
    host.set("env", env_obj)?;
    Ok(())
}

fn provider_settings_paths(app_data_dir: &Path) -> [PathBuf; 2] {
    [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ]
}

fn load_provider_config_map(app_data_dir: &Path) -> HashMap<String, JsonValue> {
    for path in provider_settings_paths(app_data_dir) {
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => continue,
        };
        let json: JsonValue = match serde_json::from_str(&text) {
            Ok(json) => json,
            Err(_) => continue,
        };
        let configs = match json.get("providerConfigs").and_then(JsonValue::as_object) {
            Some(configs) => configs,
            None => continue,
        };
        return configs
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();
    }

    HashMap::new()
}

fn inject_provider_config<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
    app_data_dir: &PathBuf,
) -> rquickjs::Result<()> {
    let provider_config_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.clone();

    provider_config_obj.set(
        "get",
        Function::new(ctx.clone(), move |key: String| -> Option<String> {
            let configs = load_provider_config_map(&data_dir);
            let entry = configs.get(&pid)?;
            let object = entry.as_object()?;
            let value = object.get(&key)?;
            value.as_str().map(str::to_string)
        })?,
    )?;

    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.clone();
    provider_config_obj.set(
        "getAll",
        Function::new(ctx.clone(), move || -> String {
            let configs = load_provider_config_map(&data_dir);
            configs
                .get(&pid)
                .and_then(|value| serde_json::to_string(value).ok())
                .unwrap_or_else(|| "{}".to_string())
        })?,
    )?;

    host.set("providerConfig", provider_config_obj)?;
    Ok(())
}

fn inject_http<'js>(ctx: &Ctx<'js>, host: &Object<'js>, plugin_id: &str) -> rquickjs::Result<()> {
    let http_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    http_obj.set(
        "_requestRaw",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, req_json: String| -> rquickjs::Result<String> {
                let req: HttpReqParams = serde_json::from_str(&req_json).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("invalid request: {}", e))
                })?;

                let method_str = req.method.as_deref().unwrap_or("GET");
                let redacted_url = redact_url(&req.url);
                log::info!("[plugin:{}] HTTP {} {}", pid, method_str, redacted_url);

                let mut header_map = reqwest::header::HeaderMap::new();
                if let Some(headers) = &req.headers {
                    for (key, val) in headers {
                        let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                            .map_err(|e| {
                                Exception::throw_message(
                                    &ctx_inner,
                                    &format!("invalid header name '{}': {}", key, e),
                                )
                            })?;
                        let value = reqwest::header::HeaderValue::from_str(val).map_err(|e| {
                            Exception::throw_message(
                                &ctx_inner,
                                &format!("invalid header value for '{}': {}", key, e),
                            )
                        })?;
                        header_map.insert(name, value);
                    }
                }

                let timeout_ms = req.timeout_ms.unwrap_or(10_000);
                let mut builder = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_millis(timeout_ms))
                    .redirect(reqwest::redirect::Policy::none());
                if req.dangerously_ignore_tls.unwrap_or(false) {
                    builder = builder.danger_accept_invalid_certs(true);
                }
                let client = builder
                    .build()
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))?;

                let method = req.method.as_deref().unwrap_or("GET");
                let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("invalid http method '{}': {}", method, e),
                    )
                })?;
                let mut builder = client.request(method, &req.url);
                builder = builder.headers(header_map);
                if let Some(body) = req.body_text {
                    builder = builder.body(body);
                }

                let response = builder
                    .send()
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))?;

                let status = response.status().as_u16();
                let mut resp_headers = std::collections::HashMap::new();
                for (key, value) in response.headers().iter() {
                    let header_value = value.to_str().map_err(|e| {
                        Exception::throw_message(
                            &ctx_inner,
                            &format!("invalid response header '{}': {}", key, e),
                        )
                    })?;
                    resp_headers.insert(key.to_string(), header_value.to_string());
                }
                let body = response
                    .text()
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))?;

                // Redact BEFORE truncation to ensure sensitive values are caught while intact
                let redacted_body = redact_body(&body);
                let body_preview = if redacted_body.len() > 500 {
                    // UTF-8 safe truncation: find valid char boundary at or before 500
                    let truncated: String = redacted_body
                        .char_indices()
                        .take_while(|(i, _)| *i < 500)
                        .map(|(_, c)| c)
                        .collect();
                    format!("{}... ({} bytes total)", truncated, body.len())
                } else {
                    redacted_body
                };
                log::info!(
                    "[plugin:{}] HTTP {} {} -> {} | {}",
                    pid,
                    method_str,
                    redacted_url,
                    status,
                    body_preview
                );

                let resp = HttpRespParams {
                    status,
                    headers: resp_headers,
                    body_text: body,
                };

                serde_json::to_string(&resp)
                    .map_err(|e| Exception::throw_message(&ctx_inner, &e.to_string()))
            },
        )?,
    )?;

    ctx.eval::<(), _>(
        r#"
        (function() {
            // Will be patched after __openusage_ctx is set.
            if (typeof __openusage_ctx !== "undefined") {
                void 0;
            }
        })();
        "#
        .as_bytes(),
    )
    .map_err(|e| Exception::throw_message(ctx, &format!("http wrapper init failed: {}", e)))?;

    host.set("http", http_obj)?;
    Ok(())
}

pub fn patch_http_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            var rawFn = __openusage_ctx.host.http._requestRaw;
            __openusage_ctx.host.http.request = function(req) {
                var json = JSON.stringify({
                    url: req.url,
                    method: req.method || "GET",
                    headers: req.headers || null,
                    bodyText: req.bodyText || null,
                    timeoutMs: req.timeoutMs || 10000,
                    dangerouslyIgnoreTls: req.dangerouslyIgnoreTls || false
                });
                var respJson = rawFn(json);
                return JSON.parse(respJson);
            };
        })();
        "#
        .as_bytes(),
    )
}

/// Inject utility APIs (line builders, formatters, base64, jwt) onto __openusage_ctx
pub fn inject_utils(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            var ctx = __openusage_ctx;

            // Line builders (options object API)
            ctx.line = {
                text: function(opts) {
                    var line = { type: "text", label: opts.label, value: opts.value };
                    if (opts.color) line.color = opts.color;
                    if (opts.subtitle) line.subtitle = opts.subtitle;
                    return line;
                },
                progress: function(opts) {
                    var line = { type: "progress", label: opts.label, used: opts.used, limit: opts.limit, format: opts.format };
                    if (opts.resetsAt) line.resetsAt = opts.resetsAt;
                    if (opts.periodDurationMs) line.periodDurationMs = opts.periodDurationMs;
                    if (opts.color) line.color = opts.color;
                    return line;
                },
                badge: function(opts) {
                    var line = { type: "badge", label: opts.label, text: opts.text };
                    if (opts.color) line.color = opts.color;
                    if (opts.subtitle) line.subtitle = opts.subtitle;
                    return line;
                }
            };

            // Formatters
            ctx.fmt = {
                planLabel: function(value) {
                    var text = String(value || "").trim();
                    if (!text) return "";
                    return text.replace(/(^|\s)([a-z])/g, function(match, space, letter) {
                        return space + letter.toUpperCase();
                    });
                },
                resetIn: function(secondsUntil) {
                    if (!Number.isFinite(secondsUntil) || secondsUntil < 0) return null;
                    var totalMinutes = Math.floor(secondsUntil / 60);
                    var totalHours = Math.floor(totalMinutes / 60);
                    var days = Math.floor(totalHours / 24);
                    var hours = totalHours % 24;
                    var minutes = totalMinutes % 60;
                    if (days > 0) return days + "d " + hours + "h";
                    if (totalHours > 0) return totalHours + "h " + minutes + "m";
                    if (totalMinutes > 0) return totalMinutes + "m";
                    return "<1m";
                },
                dollars: function(cents) {
                    var d = cents / 100;
                    return Math.round(d * 100) / 100;
                },
                date: function(unixMs) {
                    var d = new Date(Number(unixMs));
                    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    return months[d.getMonth()] + " " + String(d.getDate());
                }
            };

            // Shared utilities
            ctx.util = {
                tryParseJson: function(text) {
                    if (text === null || text === undefined) return null;
                    var trimmed = String(text).trim();
                    if (!trimmed) return null;
                    try {
                        return JSON.parse(trimmed);
                    } catch (e) {
                        return null;
                    }
                },
                safeJsonParse: function(text) {
                    if (text === null || text === undefined) return { ok: false };
                    var trimmed = String(text).trim();
                    if (!trimmed) return { ok: false };
                    try {
                        return { ok: true, value: JSON.parse(trimmed) };
                    } catch (e) {
                        return { ok: false };
                    }
                },
                request: function(opts) {
                    return ctx.host.http.request(opts);
                },
                requestJson: function(opts) {
                    var resp = ctx.util.request(opts);
                    var parsed = ctx.util.safeJsonParse(resp.bodyText);
                    return { resp: resp, json: parsed.ok ? parsed.value : null };
                },
                isAuthStatus: function(status) {
                    return status === 401 || status === 403;
                },
                retryOnceOnAuth: function(opts) {
                    var resp = opts.request();
                    if (ctx.util.isAuthStatus(resp.status)) {
                        var token = opts.refresh();
                        if (token) {
                            resp = opts.request(token);
                        }
                    }
                    return resp;
                },
                parseDateMs: function(value) {
                    if (value instanceof Date) {
                        var dateMs = value.getTime();
                        return Number.isFinite(dateMs) ? dateMs : null;
                    }
                    if (typeof value === "number") {
                        return Number.isFinite(value) ? value : null;
                    }
                    if (typeof value === "string") {
                        var parsed = Date.parse(value);
                        if (Number.isFinite(parsed)) return parsed;
                        var n = Number(value);
                        return Number.isFinite(n) ? n : null;
                    }
                    return null;
                },
                toIso: function(value) {
                    if (value === null || value === undefined) return null;

                    if (typeof value === "string") {
                        var s = String(value).trim();
                        if (!s) return null;

                        // Common variants
                        // - "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
                        // - "... UTC" -> "...Z"
                        if (s.indexOf(" ") !== -1 && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
                            s = s.replace(" ", "T");
                        }
                        if (s.endsWith(" UTC")) {
                            s = s.slice(0, -4) + "Z";
                        }

                        // Numeric strings: treat as seconds/ms.
                        if (/^-?\d+(\.\d+)?$/.test(s)) {
                            var n = Number(s);
                            if (!Number.isFinite(n)) return null;
                            var msNum = Math.abs(n) < 1e10 ? n * 1000 : n;
                            var dn = new Date(msNum);
                            var tn = dn.getTime();
                            if (!Number.isFinite(tn)) return null;
                            return dn.toISOString();
                        }

                        // Normalize timezone offsets without colon: "+0000" -> "+00:00"
                        if (/[+-]\d{4}$/.test(s)) {
                            s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
                        }

                        // Some APIs return RFC3339 with >3 fractional digits (e.g. .123456Z).
                        // Normalize to milliseconds so Date.parse can understand it.
                        var m = s.match(
                            /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
                        );
                        if (m) {
                            var head = m[1];
                            var frac = m[2] || "";
                            var tz = m[3];
                            if (frac) {
                                var digits = frac.slice(1);
                                if (digits.length > 3) digits = digits.slice(0, 3);
                                while (digits.length < 3) digits = digits + "0";
                                frac = "." + digits;
                            }
                            s = head + frac + tz;
                        } else {
                            // ISO-like but missing timezone: assume UTC.
                            var mNoTz = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?$/);
                            if (mNoTz) {
                                var head2 = mNoTz[1];
                                var frac2 = mNoTz[2] || "";
                                if (frac2) {
                                    var digits2 = frac2.slice(1);
                                    if (digits2.length > 3) digits2 = digits2.slice(0, 3);
                                    while (digits2.length < 3) digits2 = digits2 + "0";
                                    frac2 = "." + digits2;
                                }
                                s = head2 + frac2 + "Z";
                            }
                        }

                        var parsed = Date.parse(s);
                        if (!Number.isFinite(parsed)) return null;
                        return new Date(parsed).toISOString();
                    }

                    if (typeof value === "number") {
                        if (!Number.isFinite(value)) return null;
                        var ms = Math.abs(value) < 1e10 ? value * 1000 : value;
                        var d = new Date(ms);
                        var t = d.getTime();
                        if (!Number.isFinite(t)) return null;
                        return d.toISOString();
                    }

                    if (value instanceof Date) {
                        var t = value.getTime();
                        if (!Number.isFinite(t)) return null;
                        return value.toISOString();
                    }

                    return null;
                },
                needsRefreshByExpiry: function(opts) {
                    if (!opts) return true;
                    if (opts.expiresAtMs === null || opts.expiresAtMs === undefined) return true;
                    var nowMs = Number(opts.nowMs);
                    var expiresAtMs = Number(opts.expiresAtMs);
                    var bufferMs = Number(opts.bufferMs);
                    if (!Number.isFinite(nowMs)) return true;
                    if (!Number.isFinite(expiresAtMs)) return true;
                    if (!Number.isFinite(bufferMs)) bufferMs = 0;
                    return nowMs + bufferMs >= expiresAtMs;
                }
            };

            // Base64
            var b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            ctx.base64 = {
                decode: function(str) {
                    str = str.replace(/-/g, "+").replace(/_/g, "/");
                    while (str.length % 4) str += "=";
                    str = str.replace(/=+$/, "");
                    var result = "";
                    var len = str.length;
                    var i = 0;
                    while (i < len) {
                        var remaining = len - i;
                        var a = b64chars.indexOf(str.charAt(i++));
                        var b = b64chars.indexOf(str.charAt(i++));
                        var c = remaining > 2 ? b64chars.indexOf(str.charAt(i++)) : 0;
                        var d = remaining > 3 ? b64chars.indexOf(str.charAt(i++)) : 0;
                        var n = (a << 18) | (b << 12) | (c << 6) | d;
                        result += String.fromCharCode((n >> 16) & 0xff);
                        if (remaining > 2) result += String.fromCharCode((n >> 8) & 0xff);
                        if (remaining > 3) result += String.fromCharCode(n & 0xff);
                    }
                    return result;
                },
                encode: function(str) {
                    var result = "";
                    var len = str.length;
                    var i = 0;
                    while (i < len) {
                        var chunkStart = i;
                        var a = str.charCodeAt(i++);
                        var b = i < len ? str.charCodeAt(i++) : 0;
                        var c = i < len ? str.charCodeAt(i++) : 0;
                        var bytesInChunk = i - chunkStart;
                        var n = (a << 16) | (b << 8) | c;
                        result += b64chars.charAt((n >> 18) & 63);
                        result += b64chars.charAt((n >> 12) & 63);
                        result += bytesInChunk < 2 ? "=" : b64chars.charAt((n >> 6) & 63);
                        result += bytesInChunk < 3 ? "=" : b64chars.charAt(n & 63);
                    }
                    return result;
                }
            };

            // JWT
            ctx.jwt = {
                decodePayload: function(token) {
                    try {
                        var parts = token.split(".");
                        if (parts.length !== 3) return null;
                        var decoded = ctx.base64.decode(parts[1]);
                        return JSON.parse(decoded);
                    } catch (e) {
                        return null;
                    }
                }
            };
        })();
        "#
        .as_bytes(),
    )
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpReqParams {
    url: String,
    method: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    body_text: Option<String>,
    timeout_ms: Option<u64>,
    dangerously_ignore_tls: Option<bool>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpRespParams {
    status: u16,
    headers: std::collections::HashMap<String, String>,
    body_text: String,
}

// --- Language Server Discovery ---

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LsDiscoverOpts {
    process_name: String,
    markers: Vec<String>,
    csrf_flag: String,
    port_flag: Option<String>,
    extra_flags: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LsDiscoverResult {
    pid: i32,
    csrf: String,
    ports: Vec<i32>,
    extra: std::collections::HashMap<String, String>,
    extension_port: Option<i32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsProcessEntry {
    process_id: i32,
    command_line: Option<String>,
}

fn ls_list_processes() -> std::io::Result<Vec<(i32, String)>> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell");
        configure_background_command(&mut command);
        let output = command
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
            ])
            .output()?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if trimmed.is_empty() || trimmed == "null" {
            return Ok(Vec::new());
        }

        let mut out = Vec::new();
        if trimmed.starts_with('[') {
            let rows: Vec<WindowsProcessEntry> = serde_json::from_str(trimmed).unwrap_or_default();
            for row in rows {
                if let Some(command) = row.command_line {
                    let command = command.trim();
                    if !command.is_empty() {
                        out.push((row.process_id, command.to_string()));
                    }
                }
            }
        } else if trimmed.starts_with('{') {
            if let Ok(row) = serde_json::from_str::<WindowsProcessEntry>(trimmed) {
                if let Some(command) = row.command_line {
                    let command = command.trim();
                    if !command.is_empty() {
                        out.push((row.process_id, command.to_string()));
                    }
                }
            }
        }

        return Ok(out);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let ps_output = Command::new("/bin/ps")
            .args(["-ax", "-o", "pid=,command="])
            .output()?;

        if !ps_output.status.success() {
            return Ok(Vec::new());
        }

        let ps_stdout = String::from_utf8_lossy(&ps_output.stdout);
        let mut out = Vec::new();
        for line in ps_stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let mut parts = trimmed.splitn(2, char::is_whitespace);
            let pid_str = match parts.next() {
                Some(s) => s.trim(),
                None => continue,
            };
            let command = match parts.next() {
                Some(s) => s.trim(),
                None => continue,
            };

            if let Ok(pid) = pid_str.parse::<i32>() {
                out.push((pid, command.to_string()));
            }
        }
        Ok(out)
    }
}

fn ls_listening_ports(process_pid: i32) -> std::io::Result<Vec<i32>> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("netstat");
        configure_background_command(&mut command);
        let output = command.args(["-ano", "-p", "tcp"]).output()?;
        if !output.status.success() {
            return Ok(Vec::new());
        }
        return Ok(ls_parse_netstat_ports(
            &String::from_utf8_lossy(&output.stdout),
            process_pid,
        ));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let lsof_path = ["/usr/sbin/lsof", "/usr/bin/lsof"]
            .iter()
            .find(|p| std::path::Path::new(p).exists())
            .copied();

        if let Some(lsof) = lsof_path {
            match Command::new(lsof)
                .args([
                    "-nP",
                    "-iTCP",
                    "-sTCP:LISTEN",
                    "-a",
                    "-p",
                    &process_pid.to_string(),
                ])
                .output()
            {
                Ok(o) if o.status.success() => {
                    return Ok(ls_parse_listening_ports(&String::from_utf8_lossy(
                        &o.stdout,
                    )));
                }
                Ok(_) => return Ok(Vec::new()),
                Err(e) => return Err(e),
            }
        }

        Ok(Vec::new())
    }
}

fn inject_ls<'js>(ctx: &Ctx<'js>, host: &Object<'js>, plugin_id: &str) -> rquickjs::Result<()> {
    let ls_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    ls_obj.set(
        "_discoverRaw",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, opts_json: String| -> rquickjs::Result<String> {
                let opts: LsDiscoverOpts = serde_json::from_str(&opts_json).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("invalid discover opts: {}", e))
                })?;

                log::info!(
                    "[plugin:{}] LS discover: processName={}, markers={:?}",
                    pid,
                    opts.process_name,
                    opts.markers
                );

                let process_rows = match ls_list_processes() {
                    Ok(rows) => rows,
                    Err(e) => {
                        log::warn!("[plugin:{}] process listing failed: {}", pid, e);
                        return Ok("null".to_string());
                    }
                };

                if process_rows.is_empty() {
                    log::warn!("[plugin:{}] process listing returned no rows", pid);
                    return Ok("null".to_string());
                }

                let process_name_lower = opts.process_name.to_lowercase();
                let markers_lower: Vec<String> =
                    opts.markers.iter().map(|m| m.to_lowercase()).collect();

                // Find the target process. Marker patterns are Codeium-derived.
                // Matching priority:
                //   1. Exact --ide_name / --app_data_dir flag value (prevents
                //      "windsurf" matching "windsurf-next")
                //   2. Path substring as fallback when no flags found
                let mut found: Option<(i32, String)> = None;

                for (row_pid, command) in process_rows.iter() {
                    let command = command.trim();
                    if command.is_empty() {
                        continue;
                    }

                    let command_lower = command.to_lowercase();

                    if !command_lower.contains(&process_name_lower) {
                        continue;
                    }

                    let ide_name = ls_extract_flag(command, "--ide_name").map(|v| v.to_lowercase());
                    let app_data =
                        ls_extract_flag(command, "--app_data_dir").map(|v| v.to_lowercase());

                    let has_marker = markers_lower.iter().any(|m| {
                        // Prefer exact flag match; skip path fallback when
                        // a distinguishing flag exists.
                        if let Some(ref name) = ide_name {
                            return *name == *m;
                        }
                        if let Some(ref dir) = app_data {
                            return *dir == *m;
                        }
                        let slash = format!("/{}/", m);
                        let backslash = format!("\\{}\\", m);
                        command_lower.contains(&slash)
                            || command_lower.contains(&backslash)
                            || command_lower.contains(m)
                    });
                    if !has_marker {
                        continue;
                    }

                    found = Some((*row_pid, command.to_string()));
                    break;
                }

                let (process_pid, command) = match found {
                    Some(pair) => pair,
                    None => {
                        log::info!("[plugin:{}] LS process not found", pid);
                        return Ok("null".to_string());
                    }
                };

                // Extract CSRF token
                let csrf = match ls_extract_flag(&command, &opts.csrf_flag) {
                    Some(c) => c,
                    None => {
                        log::warn!("[plugin:{}] CSRF token not found in process args", pid);
                        return Ok("null".to_string());
                    }
                };

                // Extract extension port (optional)
                let extension_port = opts.port_flag.as_ref().and_then(|flag| {
                    ls_extract_flag(&command, flag).and_then(|v| v.parse::<i32>().ok())
                });

                // Extract extra flags (optional)
                let mut extra = std::collections::HashMap::new();
                if let Some(ref flags) = opts.extra_flags {
                    for flag in flags {
                        if let Some(val) = ls_extract_flag(&command, flag) {
                            // Use flag name without leading dashes as key
                            let key = flag.trim_start_matches('-').to_string();
                            extra.insert(key, val);
                        }
                    }
                }

                let ports = match ls_listening_ports(process_pid) {
                    Ok(ports) => ports,
                    Err(e) => {
                        log::warn!(
                            "[plugin:{}] failed to enumerate listening ports for pid {}: {}",
                            pid,
                            process_pid,
                            e
                        );
                        Vec::new()
                    }
                };

                if ports.is_empty() && extension_port.is_none() {
                    log::warn!(
                        "[plugin:{}] no listening ports found for pid {}",
                        pid,
                        process_pid
                    );
                    return Ok("null".to_string());
                }

                log::info!(
                    "[plugin:{}] LS found: pid={}, ports={:?}, csrf=[REDACTED]",
                    pid,
                    process_pid,
                    ports
                );

                let result = LsDiscoverResult {
                    pid: process_pid,
                    csrf,
                    ports,
                    extra,
                    extension_port,
                };

                serde_json::to_string(&result).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("serialize failed: {}", e))
                })
            },
        )?,
    )?;

    host.set("ls", ls_obj)?;
    Ok(())
}

pub fn patch_ls_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            var rawFn = __openusage_ctx.host.ls._discoverRaw;
            __openusage_ctx.host.ls.discover = function(opts) {
                var optsJson;
                try { optsJson = JSON.stringify(opts); } catch (e) { return null; }
                var json = rawFn(optsJson);
                if (json === "null") return null;
                return JSON.parse(json);
            };
        })();
        "#
        .as_bytes(),
    )
}

/// Extract value of a CLI flag from a command string.
/// Handles both `--flag value` and `--flag=value` forms.
fn ls_extract_flag(command: &str, flag: &str) -> Option<String> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    let flag_eq = format!("{}=", flag);
    for (i, part) in parts.iter().enumerate() {
        if *part == flag {
            if i + 1 < parts.len() {
                return Some(parts[i + 1].to_string());
            }
        } else if part.starts_with(&flag_eq) {
            return Some(part[flag_eq.len()..].to_string());
        }
    }
    None
}

/// Parse listening port numbers from `lsof -nP -iTCP -sTCP:LISTEN` output.
#[cfg(not(target_os = "windows"))]
fn ls_parse_listening_ports(output: &str) -> Vec<i32> {
    let mut ports = std::collections::BTreeSet::new();
    for line in output.lines() {
        if !line.contains("LISTEN") {
            continue;
        }
        // lsof -nP output: ... TCP 127.0.0.1:PORT (LISTEN)  or  ... TCP *:PORT
        // Scan tokens in reverse to find the address:port token.
        for token in line.split_whitespace().rev() {
            if let Some(colon_pos) = token.rfind(':') {
                let port_str = &token[colon_pos + 1..];
                if let Ok(port) = port_str.parse::<i32>() {
                    if port > 0 && port < 65536 {
                        ports.insert(port);
                        break;
                    }
                }
            }
        }
    }
    ports.into_iter().collect()
}

fn ls_parse_netstat_ports(output: &str, process_pid: i32) -> Vec<i32> {
    let mut ports = std::collections::BTreeSet::new();
    let pid_text = process_pid.to_string();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with("TCP") {
            continue;
        }

        let cols: Vec<&str> = trimmed.split_whitespace().collect();
        if cols.len() < 5 {
            continue;
        }

        let state_idx = cols.len() - 2;
        let pid_idx = cols.len() - 1;
        let foreign_addr = cols[2];
        let is_listen_row = cols[state_idx] == "LISTENING"
            || foreign_addr == "0.0.0.0:0"
            || foreign_addr == "[::]:0";
        if cols[pid_idx] != pid_text || !is_listen_row {
            continue;
        }

        if let Some(port_str) = cols[1].rsplit(':').next() {
            if let Ok(port) = port_str.trim().parse::<i32>() {
                if port > 0 && port < 65536 {
                    ports.insert(port);
                }
            }
        }
    }

    ports.into_iter().collect()
}

const CCUSAGE_VERSION: &str = "18.0.10";
const CCUSAGE_CLAUDE_PACKAGE_NAME: &str = "ccusage";
const CCUSAGE_CODEX_PACKAGE_NAME: &str = "@ccusage/codex";
const CCUSAGE_TIMEOUT_SECS: u64 = 15;
const CCUSAGE_POLL_INTERVAL_MS: u64 = 100;

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CcusageQueryOpts {
    provider: Option<String>,
    since: Option<String>,
    until: Option<String>,
    home_path: Option<String>,
    claude_path: Option<String>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageProvider {
    Claude,
    Codex,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageRunnerKind {
    Bunx,
    PnpmDlx,
    YarnDlx,
    NpmExec,
    Npx,
}

fn ccusage_runner_order() -> [CcusageRunnerKind; 5] {
    [
        CcusageRunnerKind::Bunx,
        CcusageRunnerKind::PnpmDlx,
        CcusageRunnerKind::YarnDlx,
        CcusageRunnerKind::NpmExec,
        CcusageRunnerKind::Npx,
    ]
}

fn ccusage_runner_label(kind: CcusageRunnerKind) -> &'static str {
    match kind {
        CcusageRunnerKind::Bunx => "bun x",
        CcusageRunnerKind::PnpmDlx => "pnpm dlx",
        CcusageRunnerKind::YarnDlx => "yarn dlx",
        CcusageRunnerKind::NpmExec => "npm exec",
        CcusageRunnerKind::Npx => "npx",
    }
}

#[derive(Copy, Clone)]
struct CcusageProviderConfig {
    package_name: &'static str,
    npm_exec_bin: &'static str,
    home_env_var: &'static str,
}

fn parse_ccusage_provider(value: &str) -> Option<CcusageProvider> {
    match value.trim().to_ascii_lowercase().as_str() {
        "claude" => Some(CcusageProvider::Claude),
        "codex" => Some(CcusageProvider::Codex),
        _ => None,
    }
}

fn infer_ccusage_provider(plugin_id: &str) -> Option<CcusageProvider> {
    parse_ccusage_provider(plugin_id)
}

fn resolve_ccusage_provider(opts: &CcusageQueryOpts, plugin_id: &str) -> CcusageProvider {
    opts.provider
        .as_deref()
        .and_then(parse_ccusage_provider)
        .or_else(|| infer_ccusage_provider(plugin_id))
        .unwrap_or(CcusageProvider::Claude)
}

fn ccusage_provider_config(provider: CcusageProvider) -> CcusageProviderConfig {
    match provider {
        CcusageProvider::Claude => CcusageProviderConfig {
            package_name: CCUSAGE_CLAUDE_PACKAGE_NAME,
            npm_exec_bin: "ccusage",
            home_env_var: "CLAUDE_CONFIG_DIR",
        },
        CcusageProvider::Codex => CcusageProviderConfig {
            package_name: CCUSAGE_CODEX_PACKAGE_NAME,
            npm_exec_bin: "ccusage-codex",
            home_env_var: "CODEX_HOME",
        },
    }
}

fn ccusage_package_spec(provider: CcusageProvider) -> String {
    let config = ccusage_provider_config(provider);
    format!("{}@{}", config.package_name, CCUSAGE_VERSION)
}

fn ccusage_home_override<'a>(
    opts: &'a CcusageQueryOpts,
    provider: CcusageProvider,
) -> Option<&'a str> {
    if let Some(home_path) = opts
        .home_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(home_path);
    }

    match provider {
        CcusageProvider::Claude => opts
            .claude_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
        CcusageProvider::Codex => None,
    }
}

fn ccusage_runner_candidates(kind: CcusageRunnerKind) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    match kind {
        CcusageRunnerKind::Bunx => {
            #[cfg(target_os = "windows")]
            {
                if let Some(home) = dirs::home_dir() {
                    candidates.push(home.join(".bun/bin/bun.exe").to_string_lossy().to_string());
                }
                candidates.push("bun".to_string());
            }

            #[cfg(not(target_os = "windows"))]
            {
                if let Some(home) = dirs::home_dir() {
                    candidates.push(home.join(".bun/bin/bunx").to_string_lossy().to_string());
                }
                candidates.extend(
                    ["/opt/homebrew/bin/bunx", "/usr/local/bin/bunx", "bunx"]
                        .into_iter()
                        .map(str::to_string),
                );
            }
        }
        CcusageRunnerKind::PnpmDlx => {
            candidates.extend(
                ["/opt/homebrew/bin/pnpm", "/usr/local/bin/pnpm", "pnpm"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::YarnDlx => {
            candidates.extend(
                ["/opt/homebrew/bin/yarn", "/usr/local/bin/yarn", "yarn"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::NpmExec => {
            candidates.extend(
                ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "npm"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::Npx => {
            candidates.extend(
                ["/opt/homebrew/bin/npx", "/usr/local/bin/npx", "npx"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
    }

    let mut unique = Vec::new();
    for candidate in candidates {
        if candidate.is_empty() || unique.iter().any(|c| c == &candidate) {
            continue;
        }
        unique.push(candidate);
    }
    unique
}

fn ccusage_path_entries_with(home: Option<&Path>, existing_path: Option<&OsStr>) -> Vec<PathBuf> {
    let mut entries: Vec<PathBuf> = Vec::new();

    if let Some(home) = home {
        entries.push(home.join(".bun/bin"));
        entries.push(home.join(".nvm/current/bin"));
        entries.push(home.join(".local/bin"));
    }

    entries.extend(
        ["/opt/homebrew/bin", "/usr/local/bin"]
            .into_iter()
            .map(PathBuf::from),
    );

    if let Some(existing_path) = existing_path {
        for path in std::env::split_paths(existing_path) {
            entries.push(path);
        }
    }

    let mut unique_entries = Vec::new();
    for entry in entries {
        if entry.as_os_str().is_empty() || unique_entries.iter().any(|path| path == &entry) {
            continue;
        }
        unique_entries.push(entry);
    }
    unique_entries
}

fn ccusage_enriched_path_with(
    home: Option<&Path>,
    existing_path: Option<&OsStr>,
) -> Option<OsString> {
    let entries = ccusage_path_entries_with(home, existing_path);
    if entries.is_empty() {
        return None;
    }
    std::env::join_paths(entries).ok()
}

fn ccusage_enriched_path() -> Option<OsString> {
    let home = dirs::home_dir();
    let existing_path = std::env::var_os("PATH");
    ccusage_enriched_path_with(home.as_deref(), existing_path.as_deref())
}

fn ccusage_runner_available(candidate: &str, enriched_path: Option<&OsStr>) -> bool {
    let mut command = std::process::Command::new(candidate);
    configure_background_command(&mut command);
    command.arg("--version");
    if let Some(path) = enriched_path {
        command.env("PATH", path);
    }
    command
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    command.status().map(|s| s.success()).unwrap_or(false)
}

fn configure_ccusage_command(
    command: &mut std::process::Command,
    args: &[String],
    enriched_path: Option<&OsStr>,
) {
    configure_background_command(command);
    command.args(args);
    if let Some(path) = enriched_path {
        command.env("PATH", path);
    }
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
}

fn resolve_ccusage_runner_binary(kind: CcusageRunnerKind) -> Option<String> {
    let path = ccusage_enriched_path();
    for candidate in ccusage_runner_candidates(kind) {
        if ccusage_runner_available(&candidate, path.as_deref()) {
            return Some(candidate);
        }
    }
    None
}

fn collect_ccusage_runners_with<F>(mut resolver: F) -> Vec<(CcusageRunnerKind, String)>
where
    F: FnMut(CcusageRunnerKind) -> Option<String>,
{
    let mut runners = Vec::new();
    for kind in ccusage_runner_order() {
        if let Some(program) = resolver(kind) {
            runners.push((kind, program));
        }
    }
    runners
}

fn collect_ccusage_runners() -> Vec<(CcusageRunnerKind, String)> {
    collect_ccusage_runners_with(resolve_ccusage_runner_binary)
}

fn ccusage_runner_cache() -> &'static Mutex<Option<Vec<(CcusageRunnerKind, String)>>> {
    static CACHE: OnceLock<Mutex<Option<Vec<(CcusageRunnerKind, String)>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn read_ccusage_runner_cache() -> Option<Vec<(CcusageRunnerKind, String)>> {
    ccusage_runner_cache().lock().ok()?.clone()
}

fn write_ccusage_runner_cache(runners: &[(CcusageRunnerKind, String)]) {
    if runners.is_empty() {
        return;
    }

    if let Ok(mut cache) = ccusage_runner_cache().lock() {
        *cache = Some(runners.to_vec());
    }
}

fn invalidate_ccusage_runner_cache() {
    if let Ok(mut cache) = ccusage_runner_cache().lock() {
        *cache = None;
    }
}

fn collect_ccusage_runners_cached_with<F>(mut resolver: F) -> Vec<(CcusageRunnerKind, String)>
where
    F: FnMut() -> Vec<(CcusageRunnerKind, String)>,
{
    if let Some(runners) = read_ccusage_runner_cache() {
        return runners;
    }

    let runners = resolver();
    write_ccusage_runner_cache(&runners);
    runners
}

fn collect_ccusage_runners_cached() -> Vec<(CcusageRunnerKind, String)> {
    collect_ccusage_runners_cached_with(collect_ccusage_runners)
}

fn append_ccusage_common_args(args: &mut Vec<String>, opts: &CcusageQueryOpts) {
    args.extend([
        "daily".to_string(),
        "--json".to_string(),
        "--order".to_string(),
        "desc".to_string(),
    ]);

    if let Some(since) = opts
        .since
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--since".to_string());
        args.push(since.to_string());
    }

    if let Some(until) = opts
        .until
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--until".to_string());
        args.push(until.to_string());
    }
}

fn ccusage_runner_args(
    kind: CcusageRunnerKind,
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
) -> Vec<String> {
    let config = ccusage_provider_config(provider);
    let package_spec = ccusage_package_spec(provider);
    let mut args: Vec<String> = match kind {
        CcusageRunnerKind::Bunx => {
            #[cfg(target_os = "windows")]
            {
                vec!["x".to_string(), "--silent".to_string(), package_spec.clone()]
            }

            #[cfg(not(target_os = "windows"))]
            {
                vec!["--silent".to_string(), package_spec.clone()]
            }
        }
        CcusageRunnerKind::PnpmDlx => {
            vec!["-s".to_string(), "dlx".to_string(), package_spec.clone()]
        }
        CcusageRunnerKind::YarnDlx => {
            vec!["dlx".to_string(), "-q".to_string(), package_spec.clone()]
        }
        CcusageRunnerKind::NpmExec => vec![
            "exec".to_string(),
            "--yes".to_string(),
            format!("--package={package_spec}"),
            "--".to_string(),
            config.npm_exec_bin.to_string(),
        ],
        CcusageRunnerKind::Npx => vec!["--yes".to_string(), package_spec],
    };

    append_ccusage_common_args(&mut args, opts);
    args
}

fn extract_last_json_value(stdout: &str) -> Option<String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
        return Some(trimmed.to_string());
    }

    let mut starts: Vec<usize> = trimmed
        .char_indices()
        .filter(|(_, c)| *c == '{' || *c == '[')
        .map(|(idx, _)| idx)
        .collect();
    starts.reverse();

    for start in starts {
        let candidate = trimmed[start..].trim();
        if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
            return Some(candidate.to_string());
        }
    }

    None
}

fn normalize_ccusage_output(stdout: &str) -> Option<String> {
    let json_value = extract_last_json_value(stdout)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_value).ok()?;

    let normalized = match parsed {
        serde_json::Value::Array(daily) => serde_json::json!({ "daily": daily }),
        serde_json::Value::Object(map) => {
            let daily = map.get("daily")?;
            if !daily.is_array() {
                return None;
            }
            serde_json::Value::Object(map)
        }
        _ => return None,
    };

    serde_json::to_string(&normalized).ok()
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageRunStatus {
    Success,
    Failed,
    SpawnFailed,
}

fn run_ccusage_with_runner(
    kind: CcusageRunnerKind,
    program: &str,
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
) -> (CcusageRunStatus, Option<String>) {
    let args = ccusage_runner_args(kind, opts, provider);
    let enriched_path = ccusage_enriched_path();
    let mut command = std::process::Command::new(program);
    configure_ccusage_command(&mut command, &args, enriched_path.as_deref());

    if let Some(home_path) = ccusage_home_override(opts, provider) {
        let config = ccusage_provider_config(provider);
        command.env(config.home_env_var, home_path);
    }

    log::info!(
        "[plugin:{}] ccusage query via {} ({})",
        plugin_id,
        ccusage_runner_label(kind),
        program
    );

    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            log::warn!(
                "[plugin:{}] ccusage spawn failed for {}: {}",
                plugin_id,
                ccusage_runner_label(kind),
                e
            );
            return (CcusageRunStatus::SpawnFailed, None);
        }
    };

    // Drain pipes concurrently while the process is running so the child cannot block on full
    // stdout/stderr buffers before exit.
    let mut stdout_reader = child.stdout.take().map(|mut stdout| {
        std::thread::spawn(move || {
            let mut v = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stdout, &mut v);
            v
        })
    });
    let mut stderr_reader = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut v = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stderr, &mut v);
            v
        })
    });

    let timeout = std::time::Duration::from_secs(CCUSAGE_TIMEOUT_SECS);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_reader
                    .take()
                    .and_then(|reader| reader.join().ok())
                    .unwrap_or_default();
                let stderr = stderr_reader
                    .take()
                    .and_then(|reader| reader.join().ok())
                    .unwrap_or_default();

                if status.success() {
                    let out = String::from_utf8_lossy(&stdout);
                    if let Some(normalized_json) = normalize_ccusage_output(&out) {
                        return (CcusageRunStatus::Success, Some(normalized_json));
                    }
                    log::warn!(
                        "[plugin:{}] ccusage output parse failed for {}",
                        plugin_id,
                        ccusage_runner_label(kind)
                    );
                    return (CcusageRunStatus::Failed, None);
                }

                let err = String::from_utf8_lossy(&stderr);
                log::warn!(
                    "[plugin:{}] ccusage failed for {}: {}",
                    plugin_id,
                    ccusage_runner_label(kind),
                    err.trim()
                );
                return (CcusageRunStatus::Failed, None);
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.take().and_then(|reader| reader.join().ok());
                    let _ = stderr_reader.take().and_then(|reader| reader.join().ok());
                    log::warn!(
                        "[plugin:{}] ccusage timed out after {}s for {}",
                        plugin_id,
                        CCUSAGE_TIMEOUT_SECS,
                        ccusage_runner_label(kind)
                    );
                    return (CcusageRunStatus::Failed, None);
                }
                std::thread::sleep(std::time::Duration::from_millis(CCUSAGE_POLL_INTERVAL_MS));
            }
            Err(e) => {
                log::warn!(
                    "[plugin:{}] ccusage wait failed for {}: {}",
                    plugin_id,
                    ccusage_runner_label(kind),
                    e
                );
                return (CcusageRunStatus::Failed, None);
            }
        }
    }
}

fn run_ccusage_with_runner_list(
    runners: &[(CcusageRunnerKind, String)],
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
) -> (bool, Option<String>) {
    for (kind, program) in runners {
        let (status, result) = run_ccusage_with_runner(*kind, program, opts, provider, plugin_id);
        if let Some(result) = result {
            return (false, Some(result));
        }

        if status == CcusageRunStatus::SpawnFailed {
            return (true, None);
        }
    }

    (false, None)
}

fn run_ccusage_query_with<FCached, FInvalidate, FRun>(
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
    mut collect_runners: FCached,
    mut invalidate_cache: FInvalidate,
    mut run_runners: FRun,
) -> Result<String, &'static str>
where
    FCached: FnMut() -> Vec<(CcusageRunnerKind, String)>,
    FInvalidate: FnMut(),
    FRun: FnMut(&[(CcusageRunnerKind, String)], &CcusageQueryOpts, CcusageProvider, &str) -> (bool, Option<String>),
{
    let cached_runners = collect_runners();
    if cached_runners.is_empty() {
        log::warn!("[plugin:{}] no package runner found for ccusage query", plugin_id);
        return Err("no_runner");
    }

    let (cache_stale, result) = run_runners(&cached_runners, opts, provider, plugin_id);
    if let Some(result) = result {
        return Ok(result);
    }

    if cache_stale {
        invalidate_cache();
        let refreshed_runners = collect_runners();
        if refreshed_runners.is_empty() {
            log::warn!(
                "[plugin:{}] no package runner found for ccusage query after cache refresh",
                plugin_id
            );
            return Err("no_runner");
        }

        let (_, refreshed_result) = run_runners(&refreshed_runners, opts, provider, plugin_id);
        if let Some(result) = refreshed_result {
            return Ok(result);
        }
    }

    Err("runner_failed")
}

fn run_ccusage_query(
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
) -> Result<String, &'static str> {
    run_ccusage_query_with(
        opts,
        provider,
        plugin_id,
        collect_ccusage_runners_cached,
        invalidate_ccusage_runner_cache,
        run_ccusage_with_runner_list,
    )
}

fn inject_ccusage<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
) -> rquickjs::Result<()> {
    let ccusage_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    ccusage_obj.set(
        "_queryRaw",
        Function::new(
            ctx.clone(),
            move |_ctx_inner: Ctx<'_>, opts_json: String| -> rquickjs::Result<String> {
                let opts: CcusageQueryOpts = match serde_json::from_str(&opts_json) {
                    Ok(v) => v,
                    Err(e) => {
                        log::warn!("[plugin:{}] invalid ccusage opts JSON: {}", pid, e);
                        CcusageQueryOpts::default()
                    }
                };
                let provider = resolve_ccusage_provider(&opts, &pid);
                match run_ccusage_query(&opts, provider, &pid) {
                    Ok(result) => {
                        let data: serde_json::Value = match serde_json::from_str(&result) {
                            Ok(v) => v,
                            Err(e) => {
                                log::warn!(
                                    "[plugin:{}] ccusage normalized payload parse failed: {}",
                                    pid,
                                    e
                                );
                                return Ok(
                                    serde_json::json!({ "status": "runner_failed" }).to_string()
                                );
                            }
                        };
                        Ok(serde_json::json!({ "status": "ok", "data": data }).to_string())
                    }
                    Err(status) => {
                        if status == "runner_failed" {
                            log::warn!(
                                "[plugin:{}] ccusage query failed with all available runners",
                                pid
                            );
                        }
                        Ok(serde_json::json!({ "status": status }).to_string())
                    }
                }
            },
        )?,
    )?;

    host.set("ccusage", ccusage_obj)?;
    Ok(())
}

pub fn patch_ccusage_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            var rawFn = __openusage_ctx.host.ccusage._queryRaw;
            __openusage_ctx.host.ccusage.query = function(opts) {
                var result = rawFn(JSON.stringify(opts || {}));
                try {
                    var parsed = JSON.parse(result);
                    if (parsed && typeof parsed === "object" && typeof parsed.status === "string") {
                        return parsed;
                    }
                } catch (e) {}
                return { status: "runner_failed" };
            };
        })();
        "#
        .as_bytes(),
    )
}

fn inject_keychain<'js>(ctx: &Ctx<'js>, host: &Object<'js>) -> rquickjs::Result<()> {
    let keychain_obj = Object::new(ctx.clone())?;

    keychain_obj.set(
        "readGenericPassword",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, service: String| -> rquickjs::Result<String> {
                let entry = Entry::new(KEYRING_TARGET, &service).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("credential store unavailable: {}", e),
                    )
                })?;
                entry.get_password().map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("credential read failed: {}", e))
                })
            },
        )?,
    )?;

    keychain_obj.set(
        "writeGenericPassword",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, service: String, value: String| -> rquickjs::Result<()> {
                let entry = Entry::new(KEYRING_TARGET, &service).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("credential store unavailable: {}", e),
                    )
                })?;
                entry.set_password(&value).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("credential write failed: {}", e))
                })
            },
        )?,
    )?;

    keychain_obj.set(
        "readGenericPasswordForAccount",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>,
                  service: String,
                  account: String|
                  -> rquickjs::Result<String> {
                let entry = Entry::new(&service, &account).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("credential store unavailable: {}", e),
                    )
                })?;
                entry.get_password().map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("credential read failed: {}", e))
                })
            },
        )?,
    )?;

    keychain_obj.set(
        "deleteGenericPassword",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, service: String| -> rquickjs::Result<()> {
                let entry = Entry::new(KEYRING_TARGET, &service).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("credential store unavailable: {}", e),
                    )
                })?;
                entry.delete_credential().map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("credential delete failed: {}", e),
                    )
                })
            },
        )?,
    )?;

    host.set("keychain", keychain_obj)?;
    Ok(())
}

fn inject_gh<'js>(ctx: &Ctx<'js>, host: &Object<'js>) -> rquickjs::Result<()> {
    let gh_obj = Object::new(ctx.clone())?;

    gh_obj.set(
        "readAuthToken",
        Function::new(
            ctx.clone(),
            move |hostname: Option<String>, user: Option<String>| -> Option<String> {
                let mut command = Command::new("gh");
                configure_background_command(&mut command);
                command.args(["auth", "token"]);

                if let Some(hostname) = hostname.as_deref() {
                    let trimmed = hostname.trim();
                    if !trimmed.is_empty() {
                        command.args(["--hostname", trimmed]);
                    }
                }

                if let Some(user) = user.as_deref() {
                    let trimmed = user.trim();
                    if !trimmed.is_empty() {
                        command.args(["--user", trimmed]);
                    }
                }

                let output = command.output().ok()?;
                if !output.status.success() {
                    return None;
                }

                last_non_empty_trimmed_line(&String::from_utf8_lossy(&output.stdout))
            },
        )?,
    )?;

    host.set("gh", gh_obj)?;
    Ok(())
}

fn inject_provider_secrets<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
    app_data_dir: &PathBuf,
) -> rquickjs::Result<()> {
    let provider_secrets_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.clone();

    provider_secrets_obj.set(
        "read",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, secret_key: String| -> rquickjs::Result<String> {
                #[cfg(target_os = "windows")]
                {
                    match provider_secret_store::read_provider_secret(&data_dir, &pid, &secret_key)
                    {
                        Ok(Some(secret)) => return Ok(secret),
                        Ok(None) => {}
                        Err(error) => {
                            return Err(Exception::throw_message(
                                &ctx_inner,
                                &format!("provider secret store read failed: {}", error),
                            ));
                        }
                    }
                }

                let mut services = vec![provider_secret_service(&pid, &secret_key)];
                services.extend(provider_secret_legacy_services(&pid, &secret_key));

                for service in services {
                    let mut specs = vec![provider_secret_entry_spec(&service)];
                    #[cfg(target_os = "windows")]
                    {
                        specs.push(provider_secret_legacy_entry_spec(&service));
                    }

                    for spec in specs {
                        let entry = open_provider_secret_entry(spec).map_err(|e| {
                            Exception::throw_message(
                                &ctx_inner,
                                &format!("credential store unavailable: {}", e),
                            )
                        })?;
                        match entry.get_password() {
                            Ok(password) => return Ok(password),
                            Err(error) => {
                                let message = error.to_string();
                                if is_missing_credential_error(&message) {
                                    continue;
                                }
                                return Err(Exception::throw_message(
                                    &ctx_inner,
                                    &format!("credential read failed: {}", error),
                                ));
                            }
                        }
                    }
                }

                Err(Exception::throw_message(
                    &ctx_inner,
                    "provider secret not found",
                ))
            },
        )?,
    )?;

    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.clone();
    provider_secrets_obj.set(
        "write",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, secret_key: String, value: String| -> rquickjs::Result<()> {
                let trimmed_key = secret_key.trim();
                let trimmed_value = value.trim();
                if trimmed_key.is_empty() {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "provider secret key is required",
                    ));
                }
                if trimmed_value.is_empty() {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "provider secret value cannot be empty",
                    ));
                }

                #[cfg(target_os = "windows")]
                provider_secret_store::save_provider_secret(
                    &data_dir,
                    &pid,
                    trimmed_key,
                    trimmed_value,
                )
                .map_err(|error| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("provider secret store write failed: {}", error),
                    )
                })?;

                #[cfg(not(target_os = "windows"))]
                {
                    let service = provider_secret_service(&pid, trimmed_key);
                    let entry = open_provider_secret_entry(provider_secret_entry_spec(&service))
                        .map_err(|error| {
                            Exception::throw_message(
                                &ctx_inner,
                                &format!("credential store unavailable: {}", error),
                            )
                        })?;
                    entry.set_password(trimmed_value).map_err(|error| {
                        Exception::throw_message(
                            &ctx_inner,
                            &format!("credential write failed: {}", error),
                        )
                    })?;
                }

                Ok(())
            },
        )?,
    )?;

    host.set("providerSecrets", provider_secrets_obj)?;
    Ok(())
}

fn sqlite_json_value(value: ValueRef<'_>) -> JsonValue {
    match value {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(v) => JsonValue::from(v),
        ValueRef::Real(v) => JsonValue::from(v),
        ValueRef::Text(v) => JsonValue::String(String::from_utf8_lossy(v).to_string()),
        ValueRef::Blob(v) => JsonValue::String(base64::engine::general_purpose::STANDARD.encode(v)),
    }
}

fn inject_sqlite<'js>(ctx: &Ctx<'js>, host: &Object<'js>) -> rquickjs::Result<()> {
    let sqlite_obj = Object::new(ctx.clone())?;

    sqlite_obj.set(
        "query",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, db_path: String, sql: String| -> rquickjs::Result<String> {
                if sql.lines().any(|line| line.trim_start().starts_with('.')) {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "sqlite3 dot-commands are not allowed",
                    ));
                }
                let expanded = expand_path(&db_path);
                let conn = Connection::open_with_flags(
                    &expanded,
                    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
                )
                .map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite open failed: {}", e))
                })?;
                let mut stmt = conn.prepare(&sql).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite prepare failed: {}", e))
                })?;
                let column_names: Vec<String> = stmt
                    .column_names()
                    .iter()
                    .map(|name| (*name).to_string())
                    .collect();
                let mut rows = stmt.query([]).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite query failed: {}", e))
                })?;
                let mut out = Vec::new();
                while let Some(row) = rows.next().map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite row read failed: {}", e))
                })? {
                    let mut obj = JsonMap::new();
                    for (index, column_name) in column_names.iter().enumerate() {
                        let value = row.get_ref(index).map_err(|e| {
                            Exception::throw_message(
                                &ctx_inner,
                                &format!("sqlite column read failed: {}", e),
                            )
                        })?;
                        obj.insert(column_name.clone(), sqlite_json_value(value));
                    }
                    out.push(JsonValue::Object(obj));
                }
                serde_json::to_string(&out).map_err(|e| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("sqlite result serialization failed: {}", e),
                    )
                })
            },
        )?,
    )?;

    sqlite_obj.set(
        "exec",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, db_path: String, sql: String| -> rquickjs::Result<()> {
                if sql.lines().any(|line| line.trim_start().starts_with('.')) {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "sqlite3 dot-commands are not allowed",
                    ));
                }
                let expanded = expand_path(&db_path);
                let conn = Connection::open_with_flags(
                    &expanded,
                    OpenFlags::SQLITE_OPEN_READ_WRITE
                        | OpenFlags::SQLITE_OPEN_URI
                        | OpenFlags::SQLITE_OPEN_NO_MUTEX,
                )
                .map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite open failed: {}", e))
                })?;
                conn.execute_batch(&sql).map_err(|e| {
                    Exception::throw_message(&ctx_inner, &format!("sqlite exec failed: {}", e))
                })
            },
        )?,
    )?;

    host.set("sqlite", sqlite_obj)?;
    Ok(())
}

fn iso_now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|err| {
            log::error!("nowIso format failed: {}", err);
            "1970-01-01T00:00:00Z".to_string()
        })
}

fn expand_path(path: &str) -> String {
    if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home.to_string_lossy().to_string();
        }
    }
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rquickjs::{Context, Function, Object, Runtime};

    #[test]
    fn last_non_empty_trimmed_line_uses_final_value_when_stdout_is_noisy() {
        let stdout = "banner line\nanother message\n  sk-test-key-12345  \n";
        let value = last_non_empty_trimmed_line(stdout);
        assert_eq!(value.as_deref(), Some("sk-test-key-12345"));
    }

    #[test]
    fn last_non_empty_trimmed_line_returns_none_for_empty_stdout() {
        let stdout = "  \n\n\t\n";
        let value = last_non_empty_trimmed_line(stdout);
        assert!(value.is_none());
    }

    #[test]
    fn ls_parse_netstat_ports_accepts_localized_windows_listen_rows() {
        let output = "\
  TCP    127.0.0.1:58393        127.0.0.1:9222         HERGESTELLT     9984\n\
  TCP    127.0.0.1:63347        0.0.0.0:0              ABH\u{00D6}REN         9984\n\
  TCP    127.0.0.1:63348        0.0.0.0:0              ABH\u{00D6}REN         9984\n\
  TCP    127.0.0.1:63354        0.0.0.0:0              ABH\u{00D6}REN         9984\n\
  TCP    127.0.0.1:64000        0.0.0.0:0              ABH\u{00D6}REN         1234\n";

        assert_eq!(
            ls_parse_netstat_ports(output, 9984),
            vec![63347, 63348, 63354]
        );
    }

    #[test]
    fn keychain_api_exposes_account_read_and_write() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(&ctx, "test", &app_data, "0.0.0").expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let keychain: Object = host.get("keychain").expect("keychain");
            let _read: Function = keychain
                .get("readGenericPassword")
                .expect("readGenericPassword");
            let _write: Function = keychain
                .get("writeGenericPassword")
                .expect("writeGenericPassword");
            let _read_for_account: Function = keychain
                .get("readGenericPasswordForAccount")
                .expect("readGenericPasswordForAccount");

            let gh: Object = host.get("gh").expect("gh");
            let _read_auth_token: Function = gh.get("readAuthToken").expect("readAuthToken");
        });
    }

    #[test]
    fn crypto_api_exposes_encrypt_and_decrypt() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(&ctx, "test", &app_data, "0.0.0").expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let crypto: Object = host.get("crypto").expect("crypto");
            let encrypt: Function = crypto.get("encryptAes256Gcm").expect("encryptAes256Gcm");
            let decrypt: Function = crypto.get("decryptAes256Gcm").expect("decryptAes256Gcm");

            let key_b64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
            let plaintext = "{\"hello\":\"world\"}";
            let envelope: String = encrypt
                .call((plaintext.to_string(), key_b64.to_string()))
                .expect("encrypt");
            assert!(envelope.contains("\"nonce\""));
            assert!(envelope.contains("\"ciphertext\""));

            let roundtrip: String = decrypt
                .call((envelope, key_b64.to_string()))
                .expect("decrypt");
            assert_eq!(roundtrip, plaintext);
        });
    }

    #[test]
    fn provider_secrets_api_exposes_read_and_write() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(&ctx, "test", &app_data, "0.0.0").expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let provider_secrets: Object = host.get("providerSecrets").expect("providerSecrets");
            let _read: Function = provider_secrets.get("read").expect("read");
            let _write: Function = provider_secrets.get("write").expect("write");
        });
    }

    #[test]
    fn missing_credential_error_variants_are_tolerated_for_provider_secret_reads() {
        assert!(is_missing_credential_error("No entry found"));
        assert!(is_missing_credential_error(
            "No matching entry found in secure storage"
        ));
        assert!(is_missing_credential_error("Element not found"));
        assert!(is_missing_credential_error(
            "The system cannot find the file specified. (os error 1168)"
        ));
        assert!(is_missing_credential_error("credential not found"));
        assert!(!is_missing_credential_error(
            "Access is denied. (os error 5)"
        ));
    }

    #[test]
    fn env_api_respects_allowlist_in_host_and_js() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(&ctx, "test", &app_data, "0.0.0").expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let env: Object = host.get("env").expect("env");
            let get: Function = env.get("get").expect("get");

            for name in WHITELISTED_ENV_VARS {
                let expected = resolve_env_value(name);
                let value: Option<String> =
                    get.call((name.to_string(),)).expect("get whitelisted var");
                assert_eq!(value, expected, "{name} should match host env resolver");

                let js_expr = format!(r#"__openusage_ctx.host.env.get("{}")"#, name);
                let js_value: Option<String> = ctx.eval(js_expr).expect("js get whitelisted var");
                assert_eq!(
                    js_value, expected,
                    "{name} should match host env resolver from JS"
                );
            }

            let blocked: Option<String> = get
                .call(("__OPENUSAGE_TEST_NOT_WHITELISTED__".to_string(),))
                .expect("get blocked var");
            assert!(
                blocked.is_none(),
                "non-whitelisted vars must not be exposed"
            );

            let js_blocked: Option<String> = ctx
                .eval(r#"__openusage_ctx.host.env.get("__OPENUSAGE_TEST_NOT_WHITELISTED__")"#)
                .expect("js get blocked var");
            assert!(
                js_blocked.is_none(),
                "non-whitelisted vars must not be exposed from JS"
            );
        });
    }

    #[test]
    fn env_api_prefers_process_env() {
        struct RestoreEnvVar {
            name: &'static str,
            old: Option<String>,
        }

        impl Drop for RestoreEnvVar {
            fn drop(&mut self) {
                if let Some(value) = self.old.take() {
                    // SAFETY: tests serialize env changes via this guard; value is restored on drop.
                    unsafe { std::env::set_var(self.name, value) };
                } else {
                    // SAFETY: tests serialize env changes via this guard; var is restored/removed on drop.
                    unsafe { std::env::remove_var(self.name) };
                }
            }
        }

        let name = "ZAI_API_KEY";
        let old = std::env::var(name).ok();
        let _restore = RestoreEnvVar { name, old };
        // SAFETY: this test restores the previous value in `Drop`.
        unsafe { std::env::set_var(name, "sk-process-env-test-1234567890") };

        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(&ctx, "test", &app_data, "0.0.0").expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let env: Object = host.get("env").expect("env");
            let get: Function = env.get("get").expect("get");

            let value: Option<String> = get.call((name.to_string(),)).expect("get");
            assert_eq!(
                value.as_deref(),
                Some("sk-process-env-test-1234567890"),
                "process env should be preferred over shell lookup"
            );

            let js_value: Option<String> = ctx
                .eval(r#"__openusage_ctx.host.env.get("ZAI_API_KEY")"#)
                .expect("js get");
            assert_eq!(
                js_value.as_deref(),
                Some("sk-process-env-test-1234567890"),
                "process env should be preferred from JS"
            );
        });
    }

    #[test]
    fn redact_value_shows_first_and_last_four() {
        assert_eq!(redact_value("sk-1234567890abcdef"), "sk-1...cdef");
        assert_eq!(redact_value("short"), "[REDACTED]");
    }

    #[test]
    fn redact_url_redacts_api_key_param() {
        let url = "https://api.example.com/v1?api_key=sk-1234567890abcdef&other=value";
        let redacted = redact_url(url);
        assert!(redacted.contains("api_key=sk-1...cdef"));
        assert!(redacted.contains("other=value"));
    }

    #[test]
    fn redact_url_redacts_user_query_param() {
        let url = "https://cursor.com/api/usage?user=user_abcdefghijklmnopqrstuvwxyz&limit=10";
        let redacted = redact_url(url);
        assert!(
            redacted.contains("user=user...wxyz"),
            "user query param should be redacted, got: {}",
            redacted
        );
        assert!(
            redacted.contains("limit=10"),
            "non-sensitive params should be preserved, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_url_preserves_non_sensitive_params() {
        let url = "https://api.example.com/v1?limit=10&offset=20";
        assert_eq!(redact_url(url), url);
    }

    #[test]
    fn redact_body_redacts_jwt() {
        let body = r#"{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"}"#;
        let redacted = redact_body(body);
        // JWT gets redacted to first4...last4 format
        assert!(
            !redacted.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
            "full JWT should be redacted, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_body_redacts_api_keys() {
        let body = r#"{"key": "sk-1234567890abcdefghij"}"#;
        let redacted = redact_body(body);
        assert!(redacted.contains("sk-1...ghij"));
    }

    #[test]
    fn redact_body_redacts_json_password_field() {
        let body = r#"{"password": "supersecretpassword123"}"#;
        let redacted = redact_body(body);
        assert!(
            !redacted.contains("supersecretpassword123"),
            "password should be redacted, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_body_redacts_user_id_and_email() {
        let body = r#"{"user_id": "user-iupzZ7KFykMLrnzpkHSq7wjo", "email": "rob@sunstory.com"}"#;
        let redacted = redact_body(body);
        assert!(
            !redacted.contains("user-iupzZ7KFykMLrnzpkHSq7wjo"),
            "user_id should be redacted, got: {}",
            redacted
        );
        assert!(
            !redacted.contains("rob@sunstory.com"),
            "email should be redacted, got: {}",
            redacted
        );
        // Should show first4...last4
        assert!(
            redacted.contains("user...7wjo"),
            "user_id should show first4...last4, got: {}",
            redacted
        );
        assert!(
            redacted.contains("rob@....com"),
            "email should show first4...last4, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_body_redacts_camel_case_user_and_account_ids() {
        let body = r#"{"userId": "user_abcdefghijklmnopqrstuvwxyz", "accountId": "acct_1234567890abcdef"}"#;
        let redacted = redact_body(body);
        assert!(
            !redacted.contains("user_abcdefghijklmnopqrstuvwxyz"),
            "userId should be redacted, got: {}",
            redacted
        );
        assert!(
            !redacted.contains("acct_1234567890abcdef"),
            "accountId should be redacted, got: {}",
            redacted
        );
        assert!(
            redacted.contains("user...wxyz"),
            "userId should show first4...last4, got: {}",
            redacted
        );
        assert!(
            redacted.contains("acct...cdef"),
            "accountId should show first4...last4, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_log_message_redacts_jwt_and_api_key() {
        let msg = "token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U key=sk-1234567890abcdef";
        let redacted = redact_log_message(msg);
        assert!(
            !redacted.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
            "JWT should be redacted"
        );
        assert!(
            !redacted.contains("sk-1234567890abcdef"),
            "API key should be redacted"
        );
    }

    #[test]
    fn redact_body_redacts_login_and_analytics_tracking_id() {
        let body =
            r#"{"login":"robinebers","analytics_tracking_id":"c9df3f012bb8c2eb7aae6868ee8da6cf"}"#;
        let redacted = redact_body(body);
        assert!(
            !redacted.contains("robinebers"),
            "login should be redacted, got: {}",
            redacted
        );
        assert!(
            !redacted.contains("c9df3f012bb8c2eb7aae6868ee8da6cf"),
            "analytics_tracking_id should be redacted, got: {}",
            redacted
        );
        // login is short (<=12 chars) so becomes [REDACTED]; analytics_tracking_id is long so first4...last4
        assert!(
            redacted.contains("[REDACTED]"),
            "login should be redacted, got: {}",
            redacted
        );
        assert!(
            redacted.contains("c9df...a6cf"),
            "analytics_tracking_id should show first4...last4, got: {}",
            redacted
        );
    }

    #[test]
    fn redact_body_redacts_name_field() {
        let body =
            r#"{"userStatus":{"name":"Robin Ebers","email":"rob@sunstory.com","planStatus":{}}}"#;
        let redacted = redact_body(body);
        assert!(
            !redacted.contains("Robin Ebers"),
            "name should be redacted, got: {}",
            redacted
        );
        assert!(
            !redacted.contains("rob@sunstory.com"),
            "email should be redacted, got: {}",
            redacted
        );
        // "Robin Ebers" is 11 chars (<=12) so becomes [REDACTED]
        assert!(
            redacted.contains("\"name\": \"[REDACTED]\""),
            "name should show [REDACTED], got: {}",
            redacted
        );
    }

    #[test]
    fn ccusage_runner_order_matches_expected_priority() {
        assert_eq!(
            ccusage_runner_order(),
            [
                CcusageRunnerKind::Bunx,
                CcusageRunnerKind::PnpmDlx,
                CcusageRunnerKind::YarnDlx,
                CcusageRunnerKind::NpmExec,
                CcusageRunnerKind::Npx
            ]
        );
    }

    #[test]
    fn ccusage_runner_args_include_expected_non_interactive_flags() {
        let opts = CcusageQueryOpts {
            provider: None,
            since: Some("20260101".to_string()),
            until: Some("20260131".to_string()),
            home_path: None,
            claude_path: None,
        };
        let expected_claude_package = ccusage_package_spec(CcusageProvider::Claude);
        let expected_npm_exec_package = format!("--package={expected_claude_package}");
        #[cfg(target_os = "windows")]
        let expected_bunx = vec![
            "x",
            "--silent",
            expected_claude_package.as_str(),
            "daily",
            "--json",
            "--order",
            "desc",
            "--since",
            "20260101",
            "--until",
            "20260131",
        ];
        #[cfg(not(target_os = "windows"))]
        let expected_bunx = vec![
            "--silent",
            expected_claude_package.as_str(),
            "daily",
            "--json",
            "--order",
            "desc",
            "--since",
            "20260101",
            "--until",
            "20260131",
        ];

        let bunx = ccusage_runner_args(CcusageRunnerKind::Bunx, &opts, CcusageProvider::Claude);
        assert_eq!(bunx, expected_bunx);

        let pnpm = ccusage_runner_args(CcusageRunnerKind::PnpmDlx, &opts, CcusageProvider::Claude);
        assert_eq!(
            pnpm,
            vec![
                "-s",
                "dlx",
                expected_claude_package.as_str(),
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );

        let yarn = ccusage_runner_args(CcusageRunnerKind::YarnDlx, &opts, CcusageProvider::Claude);
        assert_eq!(
            yarn,
            vec![
                "dlx",
                "-q",
                expected_claude_package.as_str(),
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );

        let npm_exec =
            ccusage_runner_args(CcusageRunnerKind::NpmExec, &opts, CcusageProvider::Claude);
        assert_eq!(
            npm_exec,
            vec![
                "exec",
                "--yes",
                expected_npm_exec_package.as_str(),
                "--",
                "ccusage",
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );

        let npx = ccusage_runner_args(CcusageRunnerKind::Npx, &opts, CcusageProvider::Claude);
        assert_eq!(
            npx,
            vec![
                "--yes",
                expected_claude_package.as_str(),
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );
    }

    #[test]
    fn ccusage_runner_args_codex_use_scoped_package_and_bin() {
        let opts = CcusageQueryOpts {
            provider: Some("codex".to_string()),
            since: Some("20260101".to_string()),
            until: Some("20260131".to_string()),
            home_path: None,
            claude_path: None,
        };
        let expected_codex_package = ccusage_package_spec(CcusageProvider::Codex);
        let expected_npm_exec_package = format!("--package={expected_codex_package}");

        let npm_exec =
            ccusage_runner_args(CcusageRunnerKind::NpmExec, &opts, CcusageProvider::Codex);
        assert_eq!(
            npm_exec,
            vec![
                "exec",
                "--yes",
                expected_npm_exec_package.as_str(),
                "--",
                "ccusage-codex",
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );

        let npx = ccusage_runner_args(CcusageRunnerKind::Npx, &opts, CcusageProvider::Codex);
        assert_eq!(
            npx,
            vec![
                "--yes",
                expected_codex_package.as_str(),
                "daily",
                "--json",
                "--order",
                "desc",
                "--since",
                "20260101",
                "--until",
                "20260131"
            ]
        );
    }

    #[test]
    fn ccusage_path_entries_with_home_and_existing_path_preserves_order() {
        let home = std::path::PathBuf::from("/tmp/openusage-home");
        let existing = std::env::join_paths([
            std::path::PathBuf::from("/usr/bin"),
            std::path::PathBuf::from("/bin"),
        ])
        .expect("join existing path");

        let entries = ccusage_path_entries_with(Some(home.as_path()), Some(existing.as_os_str()));
        assert_eq!(
            entries,
            vec![
                home.join(".bun/bin"),
                home.join(".nvm/current/bin"),
                home.join(".local/bin"),
                std::path::PathBuf::from("/opt/homebrew/bin"),
                std::path::PathBuf::from("/usr/local/bin"),
                std::path::PathBuf::from("/usr/bin"),
                std::path::PathBuf::from("/bin"),
            ]
        );
    }

    #[test]
    fn ccusage_path_entries_with_deduplicates_prefix_and_existing_entries() {
        let existing = std::env::join_paths([
            std::path::PathBuf::from("/usr/local/bin"),
            std::path::PathBuf::from("/custom/bin"),
            std::path::PathBuf::from("/custom/bin"),
            std::path::PathBuf::from("/opt/homebrew/bin"),
        ])
        .expect("join existing path");

        let entries = ccusage_path_entries_with(None, Some(existing.as_os_str()));
        assert_eq!(
            entries,
            vec![
                std::path::PathBuf::from("/opt/homebrew/bin"),
                std::path::PathBuf::from("/usr/local/bin"),
                std::path::PathBuf::from("/custom/bin"),
            ]
        );
    }

    #[test]
    fn ccusage_enriched_path_with_uses_defaults_without_home_or_existing_path() {
        let enriched = ccusage_enriched_path_with(None, None).expect("enriched path");
        let entries: Vec<std::path::PathBuf> =
            std::env::split_paths(enriched.as_os_str()).collect();
        assert_eq!(
            entries,
            vec![
                std::path::PathBuf::from("/opt/homebrew/bin"),
                std::path::PathBuf::from("/usr/local/bin"),
            ]
        );
    }

    #[test]
    fn ccusage_enriched_path_with_preserves_entries_after_join_and_split() {
        let home = std::path::PathBuf::from("/tmp/openusage-home");
        let existing = std::env::join_paths([
            std::path::PathBuf::from("/usr/bin"),
            std::path::PathBuf::from("/bin"),
        ])
        .expect("join existing path");

        let enriched = ccusage_enriched_path_with(Some(home.as_path()), Some(existing.as_os_str()))
            .expect("path");
        let entries: Vec<std::path::PathBuf> =
            std::env::split_paths(enriched.as_os_str()).collect();

        assert_eq!(
            entries,
            vec![
                home.join(".bun/bin"),
                home.join(".nvm/current/bin"),
                home.join(".local/bin"),
                std::path::PathBuf::from("/opt/homebrew/bin"),
                std::path::PathBuf::from("/usr/local/bin"),
                std::path::PathBuf::from("/usr/bin"),
                std::path::PathBuf::from("/bin"),
            ]
        );
    }

    #[test]
    fn configure_ccusage_command_sets_path_override() {
        let mut command = std::process::Command::new("echo");
        let args = vec!["daily".to_string(), "--json".to_string()];
        let path = std::env::join_paths([
            std::path::PathBuf::from("/tmp/bin"),
            std::path::PathBuf::from("/usr/bin"),
        ])
        .expect("join path override");

        configure_ccusage_command(&mut command, &args, Some(path.as_os_str()));

        let configured_args: Vec<String> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect();
        assert_eq!(configured_args, args);

        let configured_path = command
            .get_envs()
            .find(|(key, _)| *key == std::ffi::OsStr::new("PATH"))
            .and_then(|(_, value)| value.map(std::borrow::ToOwned::to_owned));
        assert_eq!(configured_path.as_deref(), Some(path.as_os_str()));
    }

    #[test]
    fn configure_ccusage_command_skips_path_override_when_absent() {
        let mut command = std::process::Command::new("echo");
        let args = vec!["daily".to_string()];

        configure_ccusage_command(&mut command, &args, None);

        let has_path_override = command
            .get_envs()
            .any(|(key, _)| key == std::ffi::OsStr::new("PATH"));
        assert!(
            !has_path_override,
            "PATH should only be set when an override exists"
        );
    }

    #[test]
    fn resolve_ccusage_provider_prefers_explicit_opt_then_plugin_id() {
        let opts_explicit = CcusageQueryOpts {
            provider: Some("codex".to_string()),
            since: None,
            until: None,
            home_path: None,
            claude_path: None,
        };
        assert_eq!(
            resolve_ccusage_provider(&opts_explicit, "claude"),
            CcusageProvider::Codex
        );

        let opts_empty = CcusageQueryOpts::default();
        assert_eq!(
            resolve_ccusage_provider(&opts_empty, "codex"),
            CcusageProvider::Codex
        );
        assert_eq!(
            resolve_ccusage_provider(&opts_empty, "claude"),
            CcusageProvider::Claude
        );
        assert_eq!(
            resolve_ccusage_provider(&opts_empty, "unknown-provider"),
            CcusageProvider::Claude
        );
    }

    #[test]
    fn ccusage_home_override_supports_home_path_and_claude_compat() {
        let with_home = CcusageQueryOpts {
            provider: None,
            since: None,
            until: None,
            home_path: Some("/tmp/shared-home".to_string()),
            claude_path: Some("/tmp/claude-home".to_string()),
        };
        assert_eq!(
            ccusage_home_override(&with_home, CcusageProvider::Claude),
            Some("/tmp/shared-home")
        );
        assert_eq!(
            ccusage_home_override(&with_home, CcusageProvider::Codex),
            Some("/tmp/shared-home")
        );

        let claude_compat = CcusageQueryOpts {
            provider: None,
            since: None,
            until: None,
            home_path: None,
            claude_path: Some("/tmp/legacy-claude-path".to_string()),
        };
        assert_eq!(
            ccusage_home_override(&claude_compat, CcusageProvider::Claude),
            Some("/tmp/legacy-claude-path")
        );
        assert_eq!(
            ccusage_home_override(&claude_compat, CcusageProvider::Codex),
            None
        );
    }

    #[test]
    fn normalize_ccusage_output_converts_empty_array_to_daily_object() {
        let normalized = normalize_ccusage_output("noise\n[]\n").expect("normalized output");
        let value: serde_json::Value = serde_json::from_str(&normalized).expect("valid json");
        assert_eq!(value, serde_json::json!({ "daily": [] }));
    }

    #[test]
    fn normalize_ccusage_output_keeps_daily_object_shape() {
        let output = r#"
Saved lockfile
{
  "daily": [
    { "date": "2026-02-21", "totalTokens": 123, "totalCost": 0.5 }
  ],
  "totals": { "totalTokens": 123 }
}
"#;
        let normalized = normalize_ccusage_output(output).expect("normalized output");
        let value: serde_json::Value = serde_json::from_str(&normalized).expect("valid json");
        assert!(value.get("daily").and_then(|v| v.as_array()).is_some());
        assert!(value.get("totals").is_some());
    }

    #[test]
    fn normalize_ccusage_output_rejects_invalid_payloads() {
        assert!(normalize_ccusage_output("not-json").is_none());
        assert!(normalize_ccusage_output(r#"{"totals":{"totalTokens":1}}"#).is_none());
    }

    #[test]
    fn collect_ccusage_runners_uses_fallback_order() {
        let runners = collect_ccusage_runners_with(|kind| match kind {
            CcusageRunnerKind::Bunx => None,
            CcusageRunnerKind::PnpmDlx => Some("pnpm".to_string()),
            CcusageRunnerKind::YarnDlx => Some("yarn".to_string()),
            CcusageRunnerKind::NpmExec => Some("npm".to_string()),
            CcusageRunnerKind::Npx => Some("npx".to_string()),
        });
        assert_eq!(
            runners,
            vec![
                (CcusageRunnerKind::PnpmDlx, "pnpm".to_string()),
                (CcusageRunnerKind::YarnDlx, "yarn".to_string()),
                (CcusageRunnerKind::NpmExec, "npm".to_string()),
                (CcusageRunnerKind::Npx, "npx".to_string()),
            ]
        );
    }

    #[test]
    fn collect_ccusage_runners_returns_empty_when_none_available() {
        let runners = collect_ccusage_runners_with(|_| None);
        assert!(runners.is_empty());
    }

    #[test]
    fn collect_ccusage_runners_cached_resolves_once_for_successful_result() {
        invalidate_ccusage_runner_cache();
        let calls = std::cell::Cell::new(0);
        let expected = vec![(CcusageRunnerKind::Bunx, "bunx".to_string())];

        let first = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            expected.clone()
        });
        let second = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            vec![(CcusageRunnerKind::Npx, "npx".to_string())]
        });

        assert_eq!(calls.get(), 1);
        assert_eq!(first, expected);
        assert_eq!(second, expected);
        invalidate_ccusage_runner_cache();
    }

    #[test]
    fn collect_ccusage_runners_cached_does_not_cache_empty_result() {
        invalidate_ccusage_runner_cache();
        let calls = std::cell::Cell::new(0);

        let first = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            Vec::new()
        });
        let second = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            vec![(CcusageRunnerKind::Npx, "npx".to_string())]
        });

        assert!(first.is_empty());
        assert_eq!(second, vec![(CcusageRunnerKind::Npx, "npx".to_string())]);
        assert_eq!(calls.get(), 2);
        invalidate_ccusage_runner_cache();
    }

    #[test]
    fn invalidate_ccusage_runner_cache_forces_re_resolution() {
        invalidate_ccusage_runner_cache();
        let calls = std::cell::Cell::new(0);

        let first = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            vec![(CcusageRunnerKind::PnpmDlx, "pnpm".to_string())]
        });
        invalidate_ccusage_runner_cache();
        let second = collect_ccusage_runners_cached_with(|| {
            calls.set(calls.get() + 1);
            vec![(CcusageRunnerKind::YarnDlx, "yarn".to_string())]
        });

        assert_eq!(calls.get(), 2);
        assert_eq!(first, vec![(CcusageRunnerKind::PnpmDlx, "pnpm".to_string())]);
        assert_eq!(second, vec![(CcusageRunnerKind::YarnDlx, "yarn".to_string())]);
        invalidate_ccusage_runner_cache();
    }

    #[test]
    fn ccusage_query_retries_after_stale_cached_spawn_failure() {
        invalidate_ccusage_runner_cache();
        let collect_calls = std::cell::Cell::new(0);
        let invalidate_calls = std::cell::Cell::new(0);
        let run_calls = std::cell::Cell::new(0);
        let opts = CcusageQueryOpts::default();

        let result = run_ccusage_query_with(
            &opts,
            CcusageProvider::Claude,
            "claude",
            || {
                collect_calls.set(collect_calls.get() + 1);
                match collect_calls.get() {
                    1 => vec![(CcusageRunnerKind::Bunx, "cached-bunx".to_string())],
                    _ => vec![(CcusageRunnerKind::Npx, "fresh-npx".to_string())],
                }
            },
            || invalidate_calls.set(invalidate_calls.get() + 1),
            |runners, _, _, _| {
                run_calls.set(run_calls.get() + 1);
                match run_calls.get() {
                    1 => {
                        assert_eq!(
                            runners,
                            &[(CcusageRunnerKind::Bunx, "cached-bunx".to_string())]
                        );
                        (true, None)
                    }
                    2 => {
                        assert_eq!(
                            runners,
                            &[(CcusageRunnerKind::Npx, "fresh-npx".to_string())]
                        );
                        (false, Some(r#"{"daily":[]}"#.to_string()))
                    }
                    _ => panic!("unexpected extra run"),
                }
            },
        );

        assert_eq!(result, Ok(r#"{"daily":[]}"#.to_string()));
        assert_eq!(collect_calls.get(), 2);
        assert_eq!(invalidate_calls.get(), 1);
        assert_eq!(run_calls.get(), 2);
    }
}
