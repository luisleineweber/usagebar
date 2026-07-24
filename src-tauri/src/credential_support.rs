use std::path::PathBuf;

use base64::Engine;
use keyring::Entry;
use serde_json::Value as JsonValue;

pub(crate) fn now_utc_unix_ms() -> i64 {
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

pub(crate) fn read_provider_config_string(
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

pub(crate) struct GuidedCookiePolicy {
    pub(crate) login_url: &'static str,
    pub(crate) success_url_contains: &'static str,
    pub(crate) cookie_urls: &'static [&'static str],
    pub(crate) cookie_names: &'static [&'static str],
}

pub(crate) fn guided_cookie_policy(provider_id: &str) -> Option<GuidedCookiePolicy> {
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

pub(crate) fn validate_guided_cookie_capture_request(
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
pub(crate) struct ResolvedCodexAuth {
    pub(crate) auth_json: String,
    pub(crate) email: Option<String>,
    pub(crate) account_id: Option<String>,
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
            if crate::is_missing_credential_error(&message) {
                Ok(None)
            } else {
                Err(format!("Could not read Codex keychain entry: {}", error))
            }
        }
    }
}

pub(crate) fn resolve_current_codex_auth() -> Result<ResolvedCodexAuth, String> {
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

pub(crate) fn codex_profile_label(
    email: Option<&str>,
    account_id: Option<&str>,
    now_ms: i64,
) -> String {
    if let Some(email) = email {
        return email.to_string();
    }
    if let Some(account_id) = account_id {
        return format!("Codex {}", account_id);
    }
    format!("Codex {}", now_ms)
}
