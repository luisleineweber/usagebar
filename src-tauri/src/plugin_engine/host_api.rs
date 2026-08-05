use crate::plugin_engine::browser_bridge;
use crate::plugin_engine::env::*;
use crate::plugin_engine::manifest::HostCapabilities;
use crate::plugin_engine::redaction::*;
use crate::plugin_engine::runtime::ProviderInstanceRef;
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
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
#[cfg(not(test))]
type HostAppHandle = tauri::AppHandle;
#[cfg(test)]
type HostAppHandle = ();

#[cfg(not(test))]
fn clone_host_app_handle(app_handle: &Option<HostAppHandle>) -> Option<HostAppHandle> {
    app_handle.clone()
}

#[cfg(test)]
fn clone_host_app_handle(app_handle: &Option<HostAppHandle>) -> Option<HostAppHandle> {
    *app_handle
}
const WHITELISTED_ENV_VARS: [&str; 39] = [
    "CODEX_HOME",
    "CODEBUFF_API_KEY",
    "GH_CONFIG_DIR",
    "ALIBABA_API_KEY",
    "ALIBABA_REGION",
    "AUGMENT_COOKIE_HEADER",
    "AUGMENT_SESSION_AUTH",
    "CLOUDSDK_CONFIG",
    "GOOGLE_CLOUD_PROJECT",
    "GCLOUD_PROJECT",
    "CLOUDSDK_CORE_PROJECT",
    "COPILOT_BILLING_SCOPE",
    "COPILOT_BILLING_ENTERPRISE",
    "COPILOT_BILLING_ORG",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_KEY",
    "KILO_API_KEY",
    "MOONSHOT_API_KEY",
    "KIMI_API_KEY",
    "KIMI_KEY",
    "ZAI_API_KEY",
    "GLM_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_API_TOKEN",
    "MINIMAX_CN_API_KEY",
    "MISTRAL_COOKIE_HEADER",
    "MISTRAL_SESSION",
    "MISTRAL_ADMIN_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_API_URL",
    "OLLAMA_API_KEY",
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
        ProviderSecretEntrySpec {
            target: Some(service),
            service: KEYRING_TARGET,
            user: PROVIDER_SECRET_WINDOWS_USER,
        }
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
        ("opencode-go", "cookieHeader") => vec![
            provider_secret_service("opencode", "cookieHeader"),
            "OpenCode Cookie Header".to_string(),
        ],
        _ => Vec::new(),
    }
}

fn provider_config_aliases(provider_id: &str, key: &str) -> Vec<String> {
    match (provider_id, key) {
        ("opencode-go", "source") | ("opencode-go", "workspaceId") => {
            vec!["opencode".to_string()]
        }
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

#[cfg(test)]
pub fn inject_host_api<'js>(
    ctx: &Ctx<'js>,
    plugin_id: &str,
    app_data_dir: &Path,
    app_version: &str,
    app_handle: Option<HostAppHandle>,
    capabilities: &HostCapabilities,
) -> rquickjs::Result<()> {
    inject_host_api_with_instance(
        ctx,
        plugin_id,
        app_data_dir,
        app_version,
        app_handle,
        capabilities,
        None,
    )
}

pub fn inject_host_api_with_instance<'js>(
    ctx: &Ctx<'js>,
    plugin_id: &str,
    app_data_dir: &Path,
    app_version: &str,
    app_handle: Option<HostAppHandle>,
    capabilities: &HostCapabilities,
    instance_ref: Option<ProviderInstanceRef>,
) -> rquickjs::Result<()> {
    let globals = ctx.globals();
    let probe_ctx = Object::new(ctx.clone())?;

    probe_ctx.set("nowIso", iso_now())?;

    if let Some(instance_ref) = instance_ref {
        let instance_obj = Object::new(ctx.clone())?;
        instance_obj.set("providerId", instance_ref.provider_id)?;
        if let Some(instance_id) = instance_ref.instance_id {
            instance_obj.set("instanceId", instance_id)?;
        }
        probe_ctx.set("instanceRef", instance_obj)?;
    }

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
    if capabilities.fs {
        inject_fs(ctx, &host)?;
    }
    if capabilities.crypto {
        inject_crypto(ctx, &host)?;
    }
    if capabilities.env {
        inject_env(ctx, &host, plugin_id)?;
    }
    if capabilities.provider_config {
        inject_provider_config(ctx, &host, plugin_id, app_data_dir)?;
    }
    if capabilities.http {
        inject_http(ctx, &host, plugin_id, &capabilities.http_domains)?;
    }
    if capabilities.browser {
        inject_browser(ctx, &host, plugin_id, app_handle)?;
    }
    if capabilities.keychain {
        inject_keychain(ctx, &host)?;
    }
    if capabilities.gh {
        inject_gh(ctx, &host)?;
    }
    if capabilities.provider_secrets {
        inject_provider_secrets(ctx, &host, plugin_id, app_data_dir)?;
    }
    if capabilities.sqlite_read || capabilities.sqlite_write {
        inject_sqlite(ctx, &host, capabilities.sqlite_write)?;
    }
    if capabilities.ls {
        inject_ls(ctx, &host, plugin_id)?;
    }
    if capabilities.ccusage {
        inject_ccusage(ctx, &host, plugin_id)?;
    }

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
            move |ctx_inner: Ctx<'_>,
                  envelope: String,
                  key_b64: String|
                  -> rquickjs::Result<String> {
                decrypt_aes256_gcm_internal(&envelope, &key_b64)
                    .map_err(|error| Exception::throw_message(&ctx_inner, &error))
            },
        )?,
    )?;

    crypto_obj.set(
        "encryptAes256Gcm",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>,
                  plaintext: String,
                  key_b64: String|
                  -> rquickjs::Result<String> {
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
    app_data_dir: &Path,
) -> rquickjs::Result<()> {
    let provider_config_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.to_path_buf();

    provider_config_obj.set(
        "get",
        Function::new(ctx.clone(), move |key: String| -> Option<String> {
            let configs = load_provider_config_map(&data_dir);
            let mut provider_ids = vec![pid.clone()];
            provider_ids.extend(provider_config_aliases(&pid, &key));

            for provider_id in provider_ids {
                let Some(entry) = configs.get(&provider_id) else {
                    continue;
                };
                let Some(object) = entry.as_object() else {
                    continue;
                };
                let Some(value) = object.get(&key) else {
                    continue;
                };
                if let Some(value) = value.as_str() {
                    return Some(value.to_string());
                }
            }
            None
        })?,
    )?;

    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.to_path_buf();
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

fn inject_http<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
    allowed_domains: &[String],
) -> rquickjs::Result<()> {
    let http_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();
    let allowed_domains = sanitize_allowed_domains(allowed_domains);

    // Load proxy config once at injection time
    let proxy_config = load_app_config().and_then(|c| c.proxy);
    let proxy_url = proxy_config.as_ref().and_then(|p| {
        if p.enabled && !p.url.is_empty() {
            Some(p.url.clone())
        } else {
            None
        }
    });

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
                if !is_url_allowed_by_domains(&req.url, &allowed_domains) {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        &format!(
                            "http request blocked by plugin domain allowlist: {}",
                            redacted_url
                        ),
                    ));
                }

                // Check if we should bypass proxy for this URL
                let should_use_proxy = proxy_url
                    .as_ref()
                    .is_some_and(|_| !should_bypass_proxy(&req.url));

                if should_use_proxy {
                    if let Some(ref url) = proxy_url {
                        log::info!(
                            "[plugin:{}] HTTP {} {} via proxy {}",
                            pid,
                            method_str,
                            redacted_url,
                            redact_proxy_url(url)
                        );
                    }
                } else {
                    log::info!("[plugin:{}] HTTP {} {}", pid, method_str, redacted_url);
                }

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
                let ignore_tls = req.dangerously_ignore_tls.unwrap_or(false);

                // Determine proxy URL to use (if any)
                let effective_proxy = if should_use_proxy {
                    proxy_url.as_deref()
                } else {
                    None
                };

                let client = build_client_with_proxy(timeout_ms, ignore_tls, effective_proxy)
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

fn inject_browser<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
    app_handle: Option<HostAppHandle>,
) -> rquickjs::Result<()> {
    let browser_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    browser_obj.set(
        "_requestWithCookiesRaw",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, req_json: String| -> rquickjs::Result<String> {
                let Some(app_handle) = clone_host_app_handle(&app_handle) else {
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "browser-backed requests are unavailable in this build",
                    ));
                };

                let req: BrowserRequestWithCookiesReqParams = serde_json::from_str(&req_json)
                    .map_err(|error| {
                        Exception::throw_message(
                            &ctx_inner,
                            &format!("invalid browser request: {}", error),
                        )
                    })?;

                let redacted_url = redact_url(&req.url);
                log::info!("[plugin:{}] browser GET {}", pid, redacted_url);

                let response = browser_bridge::request_with_cookies(
                    &app_handle,
                    &browser_bridge::BrowserRequestWithCookiesParams {
                        url: req.url,
                        cookie_header: req.cookie_header,
                        source_url: req.source_url,
                        timeout_ms: req.timeout_ms,
                    },
                )
                .map_err(|error| Exception::throw_message(&ctx_inner, &error))?;

                let resp = BrowserRequestWithCookiesRespParams {
                    status: response.status,
                    body_text: response.body_text,
                    final_url: response.final_url,
                };
                serde_json::to_string(&resp)
                    .map_err(|error| Exception::throw_message(&ctx_inner, &error.to_string()))
            },
        )?,
    )?;

    host.set("browser", browser_obj)?;
    Ok(())
}

pub fn patch_http_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            if (!__openusage_ctx.host.http || !__openusage_ctx.host.http._requestRaw) return;
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

pub fn patch_browser_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            var rawFn = __openusage_ctx.host.browser && __openusage_ctx.host.browser._requestWithCookiesRaw;
            if (!rawFn) return;
            __openusage_ctx.host.browser.requestWithCookies = function(req) {
                var reqJson = JSON.stringify({
                    url: req.url,
                    cookieHeader: req.cookieHeader || "",
                    sourceUrl: req.sourceUrl || null,
                    timeoutMs: req.timeoutMs || 15000
                });
                var respJson = rawFn(reqJson);
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserRequestWithCookiesReqParams {
    url: String,
    cookie_header: String,
    source_url: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserRequestWithCookiesRespParams {
    status: u16,
    body_text: String,
    final_url: String,
}

// --- Language Server Discovery ---

#[cfg(test)]
pub(crate) use crate::plugin_engine::language_server::parse_netstat_ports as ls_parse_netstat_ports;
pub(crate) use crate::plugin_engine::language_server::{inject_ls, patch_ls_wrapper};
include!("ccusage_host_api.rs");
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
        "readGenericPasswordForTarget",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, target: String| -> rquickjs::Result<String> {
                #[cfg(target_os = "windows")]
                {
                    read_windows_generic_password_target(&target)
                        .map_err(|e| Exception::throw_message(&ctx_inner, &e))
                }

                #[cfg(not(target_os = "windows"))]
                {
                    Err(Exception::throw_message(
                        &ctx_inner,
                        "credential target reads are only supported on Windows",
                    ))
                }
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
    app_data_dir: &Path,
) -> rquickjs::Result<()> {
    let provider_secrets_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();
    let data_dir = app_data_dir.to_path_buf();

    provider_secrets_obj.set(
        "read",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, secret_key: String| -> rquickjs::Result<String> {
                #[cfg(target_os = "windows")]
                {
                    let mut provider_ids = vec![pid.clone()];
                    if pid == "opencode-go" && secret_key == "cookieHeader" {
                        provider_ids.push("opencode".to_string());
                    }

                    for provider_id in provider_ids {
                        match provider_secret_store::read_provider_secret(
                            &data_dir,
                            &provider_id,
                            &secret_key,
                        ) {
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
    let data_dir = app_data_dir.to_path_buf();
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

fn inject_sqlite<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    allow_write: bool,
) -> rquickjs::Result<()> {
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
                if !allow_write {
                    log::warn!("blocked plugin sqlite write");
                    return Err(Exception::throw_message(
                        &ctx_inner,
                        "sqlite write requires sqliteWrite capability",
                    ));
                }
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
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

// --- Proxy Configuration ---

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyConfig {
    enabled: bool,
    url: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    proxy: Option<ProxyConfig>,
}

fn load_app_config() -> Option<AppConfig> {
    let home = dirs::home_dir()?;
    let config_path = home.join(".usagebar").join("config.json");

    let text = std::fs::read_to_string(&config_path).ok()?;
    let config: AppConfig = serde_json::from_str(&text).ok()?;
    Some(config)
}

fn should_bypass_proxy(url: &str) -> bool {
    // Bypass proxy for localhost, 127.0.0.1, and ::1
    let lower = url.to_lowercase();
    lower.contains("localhost")
        || lower.contains("127.0.0.1")
        || lower.contains("::1")
        || lower.contains("[::1]")
}

fn redact_proxy_url(url: &str) -> String {
    // Redact credentials in proxy URL like http://user:pass@host:port
    if let Some(at_pos) = url.find('@') {
        if let Some(protocol_end) = url.find("://") {
            let protocol = &url[..protocol_end + 3];
            let after_at = &url[at_pos + 1..];
            return format!("{}***@***@{}", protocol, after_at);
        }
    }
    url.to_string()
}

fn build_client_with_proxy(
    timeout_ms: u64,
    ignore_tls: bool,
    proxy_url: Option<&str>,
) -> Result<reqwest::blocking::Client, reqwest::Error> {
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .redirect(reqwest::redirect::Policy::none());

    if ignore_tls {
        builder = builder.danger_accept_invalid_certs(true);
    }

    if let Some(proxy_url) = proxy_url {
        if !proxy_url.is_empty()
            && (proxy_url.starts_with("socks5://")
                || proxy_url.starts_with("http://")
                || proxy_url.starts_with("https://"))
        {
            let proxy = reqwest::Proxy::all(proxy_url)?;
            builder = builder.proxy(proxy);
        }
    }

    builder.build()
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
    fn sanitize_env_value_strips_ansi_and_control_sequences() {
        let raw = "\u{1b}[?1000l\n  sk-test-key-12345\u{1b}[?2004h\r\n";
        let value = sanitize_env_value(raw);
        assert_eq!(value.as_deref(), Some("sk-test-key-12345"));
    }

    #[test]
    fn extract_marked_value_ignores_noisy_shell_output() {
        let stdout = concat!(
            "startup banner\n",
            "\u{1b}[31mplugin failed\u{1b}[0m\n",
            "__OPENUSAGE_ENV_START__\n",
            "  sk-test-key-12345  \n",
            "__OPENUSAGE_ENV_END__\n",
            "\u{1b}[32muser@host\u{1b}[0m\n"
        );
        let value =
            extract_marked_value(stdout, "__OPENUSAGE_ENV_START__", "__OPENUSAGE_ENV_END__");
        assert_eq!(value.as_deref(), Some("sk-test-key-12345"));
    }

    #[test]
    fn extract_marked_value_returns_none_when_marked_value_is_empty() {
        let stdout = "__OPENUSAGE_ENV_START__\n  \n__OPENUSAGE_ENV_END__\n";
        let value =
            extract_marked_value(stdout, "__OPENUSAGE_ENV_START__", "__OPENUSAGE_ENV_END__");
        assert!(value.is_none());
    }

    #[test]
    fn parse_interactive_shell_env_output_does_not_fallback_to_end_marker_for_empty_value() {
        let stdout = "__OPENUSAGE_ENV_START__\n  \n__OPENUSAGE_ENV_END__\n";
        let value = parse_interactive_shell_env_output(
            stdout,
            "__OPENUSAGE_ENV_START__",
            "__OPENUSAGE_ENV_END__",
        );
        assert!(value.is_none());
    }

    #[test]
    fn parse_interactive_shell_env_output_falls_back_without_markers() {
        let stdout = "\u{1b}[?1000l\n  sk-test-key-12345\u{1b}[?2004h\r\n";
        let value = parse_interactive_shell_env_output(
            stdout,
            "__OPENUSAGE_ENV_START__",
            "__OPENUSAGE_ENV_END__",
        );
        assert_eq!(value.as_deref(), Some("sk-test-key-12345"));
    }

    #[test]
    fn ls_parse_netstat_ports_uses_locale_stable_windows_listen_columns() {
        let output = "\
  TCP    127.0.0.1:58393        127.0.0.1:9222         HERGESTELLT     9984\n\
  TCP    127.0.0.1:58394        127.0.0.1:9223         LISTENING       9984\n\
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
    fn keychain_api_exposes_target_and_account_reads() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(
                &ctx,
                "test",
                &app_data,
                "0.0.0",
                None,
                &HostCapabilities::default(),
            )
            .expect("inject host api");
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
            let _read_for_target: Function = keychain
                .get("readGenericPasswordForTarget")
                .expect("readGenericPasswordForTarget");

            let gh: Object = host.get("gh").expect("gh");
            let _read_auth_token: Function = gh.get("readAuthToken").expect("readAuthToken");
        });
    }

    #[test]
    fn http_domain_allowlist_matches_exact_and_wildcard_hosts() {
        let allowed = sanitize_allowed_domains(&[
            " API.Example.com ".to_string(),
            "*.example.net".to_string(),
        ]);

        assert!(is_url_allowed_by_domains(
            "https://api.example.com/v1/usage",
            &allowed
        ));
        assert!(is_url_allowed_by_domains(
            "https://billing.example.net/v1/usage",
            &allowed
        ));
        assert!(!is_url_allowed_by_domains(
            "https://example.net/v1/usage",
            &allowed
        ));
        assert!(!is_url_allowed_by_domains(
            "https://evil.example/v1/usage",
            &allowed
        ));
        assert!(!is_url_allowed_by_domains("not a url", &allowed));
    }

    #[test]
    fn empty_http_domain_allowlist_blocks_all_urls() {
        assert!(!is_url_allowed_by_domains(
            "https://api.example.com/v1/usage",
            &[]
        ));
    }

    #[test]
    fn sqlite_write_defaults_to_blocked_without_capability() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            let capabilities = HostCapabilities {
                sqlite_read: true,
                sqlite_write: false,
                ..HostCapabilities::default()
            };
            inject_host_api(&ctx, "test", &app_data, "0.0.0", None, &capabilities)
                .expect("inject host api");

            let result = ctx.eval::<(), _>(
                r#"__openusage_ctx.host.sqlite.exec("ignored.db", "CREATE TABLE t (id INTEGER)")"#,
            );

            assert!(result.is_err(), "sqlite exec should be capability-gated");
        });
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn decode_windows_generic_password_blob_accepts_utf8_and_utf16() {
        let utf8 =
            decode_windows_generic_password_blob(br#"{"token":"abc"}"#).expect("utf8 credential");
        assert_eq!(utf8, r#"{"token":"abc"}"#);

        let utf16: Vec<u8> = "zed-session"
            .encode_utf16()
            .flat_map(|code_unit| code_unit.to_le_bytes())
            .collect();
        let decoded_utf16 = decode_windows_generic_password_blob(&utf16).expect("utf16 credential");
        assert_eq!(decoded_utf16, "zed-session");
    }

    #[test]
    fn crypto_api_exposes_encrypt_and_decrypt() {
        let rt = Runtime::new().expect("runtime");
        let ctx = Context::full(&rt).expect("context");
        ctx.with(|ctx| {
            let app_data = std::env::temp_dir();
            inject_host_api(
                &ctx,
                "test",
                &app_data,
                "0.0.0",
                None,
                &HostCapabilities::default(),
            )
            .expect("inject host api");
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
            inject_host_api(
                &ctx,
                "test",
                &app_data,
                "0.0.0",
                None,
                &HostCapabilities::default(),
            )
            .expect("inject host api");
            let globals = ctx.globals();
            let probe_ctx: Object = globals.get("__openusage_ctx").expect("probe ctx");
            let host: Object = probe_ctx.get("host").expect("host");
            let provider_secrets: Object = host.get("providerSecrets").expect("providerSecrets");
            let _read: Function = provider_secrets.get("read").expect("read");
            let _write: Function = provider_secrets.get("write").expect("write");
        });
    }

    #[test]
    fn opencode_go_reuses_legacy_opencode_zen_config_and_secret_aliases() {
        assert_eq!(
            provider_config_aliases("opencode-go", "workspaceId"),
            vec!["opencode".to_string()]
        );
        assert_eq!(
            provider_config_aliases("opencode-go", "source"),
            vec!["opencode".to_string()]
        );
        assert!(provider_config_aliases("opencode-go", "selectedAccountProfileId").is_empty());

        assert_eq!(
            provider_secret_legacy_services("opencode-go", "cookieHeader"),
            vec![
                provider_secret_service("opencode", "cookieHeader"),
                "OpenCode Cookie Header".to_string(),
            ]
        );
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
            inject_host_api(
                &ctx,
                "test",
                &app_data,
                "0.0.0",
                None,
                &HostCapabilities::default(),
            )
            .expect("inject host api");
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
            inject_host_api(
                &ctx,
                "test",
                &app_data,
                "0.0.0",
                None,
                &HostCapabilities::default(),
            )
            .expect("inject host api");
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
    fn redact_body_redacts_cloud_ai_companion_project() {
        let body = r#"{"cloudaicompanionProject":"cloud-ai-companion-1234567890"}"#;
        let redacted = redact_body(body);

        assert!(!redacted.contains("cloud-ai-companion-1234567890"));
        assert!(redacted.contains("clou...7890"));
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
    fn ccusage_windows_launcher_candidates_find_cmd_files() {
        let test_dir = std::env::temp_dir().join(format!(
            "usagebar-ccusage-windows-launchers-{}",
            std::process::id()
        ));
        let app_data_dir = test_dir.join("app-data");
        let npm_dir = app_data_dir.join("npm");
        let path_dir = test_dir.join("path-bin");
        let _ = std::fs::remove_dir_all(&test_dir);
        std::fs::create_dir_all(&npm_dir).expect("create app data npm dir");
        std::fs::create_dir_all(&path_dir).expect("create path dir");
        let app_data_launcher = npm_dir.join("npx.cmd");
        let path_launcher = path_dir.join("npx.cmd");
        std::fs::write(&app_data_launcher, "@echo off\r\n").expect("write app data launcher");
        std::fs::write(&path_launcher, "@echo off\r\n").expect("write path launcher");
        let search_path = std::env::join_paths([&path_dir]).expect("join search path");

        let candidates = ccusage_windows_launcher_candidates(
            "npx",
            Some(&app_data_dir),
            Some(search_path.as_os_str()),
        );

        let _ = std::fs::remove_dir_all(&test_dir);
        assert_eq!(
            candidates,
            vec![
                app_data_launcher.to_string_lossy().to_string(),
                path_launcher.to_string_lossy().to_string(),
            ]
        );
    }

    #[test]
    fn ccusage_timeout_allows_a_bounded_cold_package_start() {
        const { assert!(CCUSAGE_TIMEOUT_SECS >= 30) };
    }

    #[test]
    fn ccusage_runner_args_include_expected_non_interactive_flags() {
        let opts = CcusageQueryOpts {
            provider: None,
            since: Some("20260101".to_string()),
            until: Some("20260131".to_string()),
            home_path: None,
            claude_path: None,
            ..Default::default()
        };
        let expected_ccusage_package = ccusage_package_spec();
        assert_eq!(expected_ccusage_package, "ccusage@20.0.19");
        let expected_npm_exec_package = format!("--package={expected_ccusage_package}");
        #[cfg(target_os = "windows")]
        let expected_bunx = vec![
            "x",
            "--silent",
            expected_ccusage_package.as_str(),
            "claude",
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
            expected_ccusage_package.as_str(),
            "claude",
            "daily",
            "--json",
            "--order",
            "desc",
            "--since",
            "20260101",
            "--until",
            "20260131",
        ];

        let bunx = ccusage_runner_args(
            CcusageRunnerKind::Bunx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(bunx, expected_bunx);

        let pnpm = ccusage_runner_args(
            CcusageRunnerKind::PnpmDlx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            pnpm,
            vec![
                "-s",
                "dlx",
                expected_ccusage_package.as_str(),
                "claude",
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

        let yarn = ccusage_runner_args(
            CcusageRunnerKind::YarnDlx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            yarn,
            vec![
                "dlx",
                "-q",
                expected_ccusage_package.as_str(),
                "claude",
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

        let npm_exec = ccusage_runner_args(
            CcusageRunnerKind::NpmExec,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            npm_exec,
            vec![
                "exec",
                "--yes",
                expected_npm_exec_package.as_str(),
                "--",
                "ccusage",
                "claude",
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

        let npx = ccusage_runner_args(
            CcusageRunnerKind::Npx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            npx,
            vec![
                "--yes",
                expected_ccusage_package.as_str(),
                "claude",
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
    fn ccusage_runner_args_legacy_fallback_uses_release_age_safe_packages() {
        let opts = CcusageQueryOpts {
            provider: None,
            since: Some("20260101".to_string()),
            until: Some("20260131".to_string()),
            home_path: None,
            claude_path: None,
            ..Default::default()
        };
        let expected_claude_package = ccusage_legacy_package_spec(CcusageProvider::Claude);
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

        let bunx = ccusage_runner_args(
            CcusageRunnerKind::Bunx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Legacy,
        );
        assert_eq!(bunx, expected_bunx);

        let npm_exec = ccusage_runner_args(
            CcusageRunnerKind::NpmExec,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Legacy,
        );
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
    }

    #[test]
    fn ccusage_runner_args_codex_use_unified_package_and_bin() {
        let opts = CcusageQueryOpts {
            provider: Some("codex".to_string()),
            since: Some("20260101".to_string()),
            until: Some("20260131".to_string()),
            home_path: None,
            claude_path: None,
            ..Default::default()
        };
        let expected_ccusage_package = ccusage_package_spec();
        let expected_npm_exec_package = format!("--package={expected_ccusage_package}");

        let npm_exec = ccusage_runner_args(
            CcusageRunnerKind::NpmExec,
            &opts,
            CcusageProvider::Codex,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            npm_exec,
            vec![
                "exec",
                "--yes",
                expected_npm_exec_package.as_str(),
                "--",
                "ccusage",
                "codex",
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

        let npx = ccusage_runner_args(
            CcusageRunnerKind::Npx,
            &opts,
            CcusageProvider::Codex,
            CcusageCommandFlavor::Current,
        );
        assert_eq!(
            npx,
            vec![
                "--yes",
                expected_ccusage_package.as_str(),
                "codex",
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
    fn ccusage_current_runner_supports_offline_pricing_mode() {
        let opts = CcusageQueryOpts {
            offline: Some(true),
            mode: Some("calculate".to_string()),
            ..Default::default()
        };
        let current = ccusage_runner_args(
            CcusageRunnerKind::Npx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Current,
        );
        assert!(
            current
                .windows(2)
                .any(|args| args == ["--mode", "calculate"])
        );
        assert!(current.iter().any(|arg| arg == "--offline"));

        let legacy = ccusage_runner_args(
            CcusageRunnerKind::Npx,
            &opts,
            CcusageProvider::Claude,
            CcusageCommandFlavor::Legacy,
        );
        assert!(!legacy.iter().any(|arg| arg == "--offline"));
        assert!(!legacy.iter().any(|arg| arg == "--mode"));
    }

    #[test]
    fn nvm_default_bin_path_resolves_version_with_v_prefix() {
        let home =
            std::env::temp_dir().join(format!("usagebar-test-nvm-v-prefix-{}", std::process::id()));
        let alias_dir = home.join(".nvm/alias");
        std::fs::create_dir_all(&alias_dir).expect("create alias dir");
        std::fs::write(alias_dir.join("default"), "v22.16.0").expect("write alias");

        let result = nvm_default_bin_path(&home);

        let _ = std::fs::remove_dir_all(&home);
        assert_eq!(result, Some(home.join(".nvm/versions/node/v22.16.0/bin")));
    }

    #[test]
    fn nvm_default_bin_path_resolves_version_without_v_prefix() {
        let home = std::env::temp_dir().join(format!(
            "usagebar-test-nvm-no-v-prefix-{}",
            std::process::id()
        ));
        let alias_dir = home.join(".nvm/alias");
        std::fs::create_dir_all(&alias_dir).expect("create alias dir");
        std::fs::write(alias_dir.join("default"), "22.16.0").expect("write alias");

        let result = nvm_default_bin_path(&home);

        let _ = std::fs::remove_dir_all(&home);
        assert_eq!(result, Some(home.join(".nvm/versions/node/v22.16.0/bin")));
    }

    #[test]
    fn nvm_default_bin_path_returns_none_when_alias_missing() {
        let home =
            std::env::temp_dir().join(format!("usagebar-test-nvm-no-alias-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);

        assert_eq!(nvm_default_bin_path(&home), None);
    }

    #[test]
    fn ccusage_path_entries_with_includes_nvm_default_version() {
        let home =
            std::env::temp_dir().join(format!("usagebar-test-nvm-entries-{}", std::process::id()));
        let alias_dir = home.join(".nvm/alias");
        std::fs::create_dir_all(&alias_dir).expect("create alias dir");
        std::fs::write(alias_dir.join("default"), "22.16.0").expect("write alias");

        let entries = ccusage_path_entries_with(Some(&home), None);

        let _ = std::fs::remove_dir_all(&home);
        assert!(
            entries.contains(&home.join(".nvm/versions/node/v22.16.0/bin")),
            "expected nvm default version bin in entries"
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
            ..Default::default()
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
    fn resolve_ccusage_provider_supports_current_multi_source_namespaces() {
        let expected = [
            ("opencode-go", CcusageProvider::OpenCode),
            ("amp", CcusageProvider::Amp),
            ("factory", CcusageProvider::Droid),
            ("kilo", CcusageProvider::Kilo),
            ("kimi", CcusageProvider::Kimi),
            ("gemini", CcusageProvider::Gemini),
            ("qwen", CcusageProvider::Qwen),
        ];

        for (plugin_id, provider) in expected {
            assert_eq!(
                resolve_ccusage_provider(&CcusageQueryOpts::default(), plugin_id),
                provider
            );
            assert!(!ccusage_legacy_supported(provider));
        }
    }

    #[test]
    fn ccusage_provider_config_uses_source_specific_data_environment() {
        assert_eq!(
            ccusage_provider_config(CcusageProvider::OpenCode).home_env_var,
            Some("OPENCODE_DATA_DIR")
        );
        assert_eq!(
            ccusage_provider_config(CcusageProvider::Droid).command_namespace,
            "droid"
        );
        assert_eq!(
            ccusage_provider_config(CcusageProvider::Gemini).home_env_var,
            Some("GEMINI_DATA_DIR")
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
            ..Default::default()
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
            ..Default::default()
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
        assert_eq!(
            first,
            vec![(CcusageRunnerKind::PnpmDlx, "pnpm".to_string())]
        );
        assert_eq!(
            second,
            vec![(CcusageRunnerKind::YarnDlx, "yarn".to_string())]
        );
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

    #[test]
    fn ccusage_runner_retries_legacy_package_when_current_package_fails() {
        let test_dir = std::env::temp_dir().join(format!(
            "usagebar-ccusage-legacy-fallback-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&test_dir);
        std::fs::create_dir_all(&test_dir).expect("create test dir");

        #[cfg(target_os = "windows")]
        let runner = {
            let path = test_dir.join("runner.cmd");
            std::fs::write(
                &path,
                "@echo off\r\n\
                 echo %* > \"%~dp0args.txt\"\r\n\
                 echo %* | findstr /C:\"20.0.19\" > nul\r\n\
                 if %ERRORLEVEL% EQU 0 exit /b 1\r\n\
                 echo {\"daily\":[]}\r\n\
                 exit /b 0\r\n",
            )
            .expect("write runner");
            path
        };

        #[cfg(not(target_os = "windows"))]
        let runner = {
            use std::io::Write;
            use std::os::unix::fs::PermissionsExt;

            let path = test_dir.join("runner.sh");
            let mut file = std::fs::File::create(&path).expect("create runner");
            writeln!(
                file,
                "#!/bin/sh\nprintf '%s' \"$*\" > \"$(dirname \"$0\")/args.txt\"\ncase \"$*\" in *20.0.19*) exit 1 ;; esac\nprintf '{{\"daily\":[]}}\\n'\n"
            )
            .expect("write runner");
            let mut perms = std::fs::metadata(&path).expect("metadata").permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&path, perms).expect("chmod runner");
            path
        };

        let opts = CcusageQueryOpts::default();
        let result = run_ccusage_with_runner_list(
            &[(CcusageRunnerKind::Npx, runner.to_string_lossy().to_string())],
            &opts,
            CcusageProvider::Claude,
            "claude",
        );

        let args = std::fs::read_to_string(test_dir.join("args.txt")).expect("read args");
        let _ = std::fs::remove_dir_all(&test_dir);

        assert_eq!(result, (false, Some(r#"{"daily":[]}"#.to_string())));
        assert!(
            args.contains("ccusage@18.0.11"),
            "expected legacy fallback args, got {args}"
        );
    }

    #[test]
    fn ccusage_runner_list_tries_all_current_runners_before_legacy_fallback() {
        let test_dir = std::env::temp_dir().join(format!(
            "usagebar-ccusage-current-before-legacy-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&test_dir);
        std::fs::create_dir_all(&test_dir).expect("create test dir");

        #[cfg(target_os = "windows")]
        let (first_runner, second_runner) = {
            let first = test_dir.join("first.cmd");
            std::fs::write(
                &first,
                "@echo off\r\necho %* | findstr /C:\"ccusage@20.0.19\" > nul\r\nif %ERRORLEVEL% EQU 0 exit /b 1\r\necho {\"daily\":[{\"date\":\"legacy\"}]}\r\n",
            )
            .expect("write first runner");
            let second = test_dir.join("second.cmd");
            std::fs::write(
                &second,
                "@echo off\r\necho {\"daily\":[{\"date\":\"current\"}]}\r\n",
            )
            .expect("write second runner");
            (first, second)
        };

        #[cfg(not(target_os = "windows"))]
        let (first_runner, second_runner) = {
            use std::os::unix::fs::PermissionsExt;
            let first = test_dir.join("first.sh");
            std::fs::write(
                &first,
                "#!/bin/sh\ncase \"$*\" in *ccusage@20.0.19*) exit 1 ;; esac\nprintf '{\"daily\":[{\"date\":\"legacy\"}]}\\n'\n",
            )
            .expect("write first runner");
            let second = test_dir.join("second.sh");
            std::fs::write(
                &second,
                "#!/bin/sh\nprintf '{\"daily\":[{\"date\":\"current\"}]}\\n'\n",
            )
            .expect("write second runner");
            for path in [&first, &second] {
                let mut permissions = std::fs::metadata(path).expect("metadata").permissions();
                permissions.set_mode(0o755);
                std::fs::set_permissions(path, permissions).expect("chmod runner");
            }
            (first, second)
        };

        let result = run_ccusage_with_runner_list(
            &[
                (
                    CcusageRunnerKind::Bunx,
                    first_runner.to_string_lossy().to_string(),
                ),
                (
                    CcusageRunnerKind::Npx,
                    second_runner.to_string_lossy().to_string(),
                ),
            ],
            &CcusageQueryOpts::default(),
            CcusageProvider::Claude,
            "claude",
        );
        let _ = std::fs::remove_dir_all(&test_dir);

        assert_eq!(
            result,
            (false, Some(r#"{"daily":[{"date":"current"}]}"#.to_string()))
        );
    }
}
