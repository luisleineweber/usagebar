use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserImportSource {
    source_id: String,
    display_name: String,
    profiles: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserCookieImportResult {
    provider_id: String,
    source_id: String,
    profile_id: String,
    code: String,
    matched_count: usize,
    skipped_expired_count: usize,
    decrypt_failure_count: usize,
}

impl BrowserCookieImportResult {
    fn new(provider_id: &str, source_id: &str, profile_id: &str, code: &str) -> Self {
        Self {
            provider_id: provider_id.to_string(),
            source_id: source_id.to_string(),
            profile_id: profile_id.to_string(),
            code: code.to_string(),
            matched_count: 0,
            skipped_expired_count: 0,
            decrypt_failure_count: 0,
        }
    }
}

struct CookiePolicy {
    domain: &'static str,
    names: &'static [&'static str],
    secret_key: &'static str,
}

fn policy_for_provider(provider_id: &str) -> Option<CookiePolicy> {
    match provider_id {
        "claude" => Some(CookiePolicy {
            domain: "claude.ai",
            names: &["sessionKey"],
            secret_key: "cookieHeader",
        }),
        _ => None,
    }
}

fn settings_paths(app_data_dir: &Path) -> [PathBuf; 2] {
    [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ]
}

fn provider_opted_in(app_data_dir: &Path, provider_id: &str) -> bool {
    settings_paths(app_data_dir).into_iter().any(|path| {
        let Ok(text) = std::fs::read_to_string(path) else {
            return false;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            return false;
        };
        json.get("providerConfigs")
            .and_then(|configs| configs.get(provider_id))
            .and_then(|config| config.get("browserCookieImportEnabled"))
            .and_then(serde_json::Value::as_bool)
            == Some(true)
    })
}

fn valid_profile_id(profile_id: &str) -> bool {
    profile_id == "Default"
        || profile_id.strip_prefix("Profile ").is_some_and(|suffix| {
            !suffix.is_empty() && suffix.chars().all(|char| char.is_ascii_digit())
        })
}

#[cfg(target_os = "windows")]
fn edge_user_data_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|path| path.join("Microsoft").join("Edge").join("User Data"))
}

#[cfg(not(target_os = "windows"))]
fn edge_user_data_dir() -> Option<PathBuf> {
    None
}

fn edge_profiles(user_data_dir: &Path) -> Vec<String> {
    let mut profiles = Vec::new();
    if user_data_dir
        .join("Default")
        .join("Network")
        .join("Cookies")
        .exists()
    {
        profiles.push("Default".to_string());
    }
    if let Ok(entries) = std::fs::read_dir(user_data_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if valid_profile_id(&name)
                && name != "Default"
                && entry.path().join("Network").join("Cookies").exists()
            {
                profiles.push(name);
            }
        }
    }
    profiles.sort_by(|left, right| {
        (left != "Default")
            .cmp(&(right != "Default"))
            .then_with(|| left.cmp(right))
    });
    profiles
}

pub fn list_sources(app_data_dir: &Path, provider_id: &str) -> Vec<BrowserImportSource> {
    if policy_for_provider(provider_id).is_none() || !provider_opted_in(app_data_dir, provider_id) {
        return Vec::new();
    }
    let Some(user_data_dir) = edge_user_data_dir() else {
        return Vec::new();
    };
    let profiles = edge_profiles(&user_data_dir);
    if profiles.is_empty() {
        return Vec::new();
    }
    vec![BrowserImportSource {
        source_id: "edge".to_string(),
        display_name: "Microsoft Edge".to_string(),
        profiles,
    }]
}

#[cfg(target_os = "windows")]
mod windows_import {
    use super::*;
    use aes_gcm::{
        Aes256Gcm, Nonce,
        aead::{Aead, KeyInit},
    };
    use base64::Engine;
    use rusqlite::{Connection, OpenFlags};
    use std::io::Read;
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptUnprotectData,
    };

    const FILE_SHARE_READ: u32 = 0x00000001;
    const FILE_SHARE_WRITE: u32 = 0x00000002;
    const FILE_SHARE_DELETE: u32 = 0x00000004;

    fn read_shared(path: &Path) -> Result<Vec<u8>, String> {
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .open(path)
            .map_err(|_| "browserLocked".to_string())?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|_| "browserLocked".to_string())?;
        Ok(bytes)
    }

    fn copy_database(path: &Path) -> Result<PathBuf, String> {
        let bytes = read_shared(path)?;
        let target = std::env::temp_dir().join(format!(
            "usagebar-browser-import-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&target, bytes).map_err(|_| "browserLocked".to_string())?;
        Ok(target)
    }

    fn dpapi_decrypt(encrypted: &[u8]) -> Result<Vec<u8>, String> {
        let input = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let result = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if result == 0 || output.pbData.is_null() {
            return Err("unsupportedEncryption".to_string());
        }
        let value =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe {
            LocalFree(output.pbData as *mut _);
        }
        Ok(value)
    }

    fn encryption_key(local_state: &Path) -> Result<(Vec<u8>, bool), String> {
        let bytes = read_shared(local_state)?;
        let json: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "unsupportedEncryption".to_string())?;
        let os_crypt = json
            .get("os_crypt")
            .ok_or_else(|| "unsupportedEncryption".to_string())?;
        let app_bound = os_crypt.get("app_bound_encrypted_key").is_some();
        let encoded = os_crypt
            .get("encrypted_key")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "unsupportedEncryption".to_string())?;
        let encrypted = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| "unsupportedEncryption".to_string())?;
        let payload = encrypted
            .strip_prefix(b"DPAPI")
            .ok_or_else(|| "unsupportedEncryption".to_string())?;
        Ok((dpapi_decrypt(payload)?, app_bound))
    }

    fn decrypt_cookie(encrypted: &[u8], key: &[u8]) -> Result<String, String> {
        if encrypted.starts_with(b"v10") || encrypted.starts_with(b"v11") {
            if encrypted.len() < 31 {
                return Err("unsupportedEncryption".to_string());
            }
            let cipher =
                Aes256Gcm::new_from_slice(key).map_err(|_| "unsupportedEncryption".to_string())?;
            let plaintext = cipher
                .decrypt(Nonce::from_slice(&encrypted[3..15]), &encrypted[15..])
                .map_err(|_| "unsupportedEncryption".to_string())?;
            return String::from_utf8(plaintext).map_err(|_| "unsupportedEncryption".to_string());
        }
        String::from_utf8(dpapi_decrypt(encrypted)?)
            .map_err(|_| "unsupportedEncryption".to_string())
    }

    fn chrome_now_micros() -> i64 {
        const WINDOWS_TO_UNIX_SECONDS: i64 = 11_644_473_600;
        (time::OffsetDateTime::now_utc().unix_timestamp() + WINDOWS_TO_UNIX_SECONDS) * 1_000_000
    }

    pub(super) fn import(
        app_data_dir: &Path,
        provider_id: &str,
        source_id: &str,
        profile_id: &str,
        policy: CookiePolicy,
    ) -> BrowserCookieImportResult {
        let mut result =
            BrowserCookieImportResult::new(provider_id, source_id, profile_id, "noMatch");
        if source_id != "edge" {
            result.code = "notInstalled".to_string();
            return result;
        }
        let Some(user_data_dir) = edge_user_data_dir() else {
            result.code = "notInstalled".to_string();
            return result;
        };
        if !valid_profile_id(profile_id) {
            result.code = "invalidProfile".to_string();
            return result;
        }

        let database = user_data_dir
            .join(profile_id)
            .join("Network")
            .join("Cookies");
        if !database.exists() {
            result.code = "notInstalled".to_string();
            return result;
        }
        let (key, app_bound) = match encryption_key(&user_data_dir.join("Local State")) {
            Ok(value) => value,
            Err(code) => {
                result.code = code;
                return result;
            }
        };
        let temp_database = match copy_database(&database) {
            Ok(path) => path,
            Err(code) => {
                result.code = code;
                return result;
            }
        };

        let read_result = (|| -> Result<Vec<(String, String)>, String> {
            let connection = Connection::open_with_flags(
                &temp_database,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )
            .map_err(|_| "browserLocked".to_string())?;
            let mut statement = connection
                .prepare(
                    "SELECT name, value, encrypted_value, expires_utc FROM cookies \
                     WHERE (host_key = ?1 OR host_key = ?2) AND name = ?3",
                )
                .map_err(|_| "browserLocked".to_string())?;
            let exact_domain = policy.domain.to_string();
            let dotted_domain = format!(".{}", policy.domain);
            let now = chrome_now_micros();
            let mut cookies = Vec::new();
            for name in policy.names {
                let rows = statement
                    .query_map((&exact_domain, &dotted_domain, name), |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Vec<u8>>(2)?,
                            row.get::<_, i64>(3)?,
                        ))
                    })
                    .map_err(|_| "browserLocked".to_string())?;
                for row in rows {
                    let (cookie_name, plain, encrypted, expires_at) =
                        row.map_err(|_| "browserLocked".to_string())?;
                    if expires_at > 0 && expires_at <= now {
                        result.skipped_expired_count += 1;
                        continue;
                    }
                    let value = if !plain.is_empty() {
                        plain
                    } else {
                        match decrypt_cookie(&encrypted, &key) {
                            Ok(value) => value,
                            Err(_) => {
                                result.decrypt_failure_count += 1;
                                continue;
                            }
                        }
                    };
                    if !value.trim().is_empty() {
                        cookies.push((cookie_name, value));
                    }
                }
            }
            Ok(cookies)
        })();
        let _ = std::fs::remove_file(&temp_database);

        let cookies = match read_result {
            Ok(cookies) => cookies,
            Err(code) => {
                result.code = code;
                return result;
            }
        };
        if cookies.is_empty() {
            result.code = if app_bound && result.decrypt_failure_count > 0 {
                "unsupportedEncryption".to_string()
            } else {
                "noMatch".to_string()
            };
            return result;
        }

        let header = cookies
            .iter()
            .map(|(name, value)| format!("{}={}", name, value))
            .collect::<Vec<_>>()
            .join("; ");
        result.matched_count = cookies.len();
        result.code = match crate::provider_secret_store::save_provider_secret(
            app_data_dir,
            provider_id,
            policy.secret_key,
            &header,
        ) {
            Ok(()) => "ok".to_string(),
            Err(_) => "vaultWriteFailed".to_string(),
        };
        result
    }
}

pub fn import_cookies(
    app_data_dir: &Path,
    provider_id: &str,
    source_id: &str,
    profile_id: &str,
) -> BrowserCookieImportResult {
    let Some(policy) = policy_for_provider(provider_id) else {
        return BrowserCookieImportResult::new(
            provider_id,
            source_id,
            profile_id,
            "unsupportedProvider",
        );
    };
    if !provider_opted_in(app_data_dir, provider_id) {
        return BrowserCookieImportResult::new(provider_id, source_id, profile_id, "notEnabled");
    }

    #[cfg(target_os = "windows")]
    {
        windows_import::import(app_data_dir, provider_id, source_id, profile_id, policy)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = policy;
        BrowserCookieImportResult::new(provider_id, source_id, profile_id, "notInstalled")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn policy_is_compiled_and_provider_specific() {
        let claude = policy_for_provider("claude").unwrap();
        assert_eq!(claude.domain, "claude.ai");
        assert_eq!(claude.names, ["sessionKey"]);
        assert!(policy_for_provider("unknown").is_none());
    }

    #[test]
    fn profile_ids_reject_path_traversal() {
        assert!(valid_profile_id("Default"));
        assert!(valid_profile_id("Profile 12"));
        assert!(!valid_profile_id("../Default"));
        assert!(!valid_profile_id("Profile personal"));
    }

    #[test]
    fn opt_in_is_required_and_result_never_serializes_cookie_values() {
        let dir = std::env::temp_dir().join(format!(
            "usagebar-browser-import-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(dir.join(".store")).unwrap();
        std::fs::write(
            dir.join(".store").join("settings.json"),
            r#"{"providerConfigs":{"claude":{"browserCookieImportEnabled":true}}}"#,
        )
        .unwrap();
        assert!(provider_opted_in(&dir, "claude"));
        assert!(!provider_opted_in(&dir, "codex"));

        let result = BrowserCookieImportResult::new("claude", "edge", "Default", "ok");
        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains("sessionKey"));
        assert!(!json.contains("sk-ant"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
