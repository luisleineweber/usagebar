use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Default, Serialize, Deserialize)]
struct ProviderSecretFile {
    entries: HashMap<String, String>,
}

fn provider_secret_storage_key(provider_id: &str, secret_key: &str) -> String {
    format!("{}::{}", provider_id, secret_key)
}

fn provider_secret_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("provider-secrets.json")
}

fn load_provider_secret_file(app_data_dir: &Path) -> Result<ProviderSecretFile, String> {
    let path = provider_secret_file_path(app_data_dir);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|error| format!("Could not parse provider secret store: {}", error)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ProviderSecretFile::default())
        }
        Err(error) => Err(format!("Could not read provider secret store: {}", error)),
    }
}

fn save_provider_secret_file(app_data_dir: &Path, file: &ProviderSecretFile) -> Result<(), String> {
    std::fs::create_dir_all(app_data_dir).map_err(|error| {
        format!(
            "Could not create provider secret store directory: {}",
            error
        )
    })?;

    let path = provider_secret_file_path(app_data_dir);
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(file)
        .map_err(|error| format!("Could not encode provider secret store: {}", error))?;

    std::fs::write(&temp_path, json)
        .map_err(|error| format!("Could not write provider secret store: {}", error))?;
    std::fs::rename(&temp_path, &path)
        .map_err(|error| format!("Could not finalize provider secret store: {}", error))?;
    Ok(())
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
    };

    fn blob_from_bytes(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    fn protect_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob_from_bytes(bytes);
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };

        let result = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if result == 0 {
            return Err(format!(
                "DPAPI encryption failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        let protected =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe {
            LocalFree(output.pbData as *mut _);
        }
        Ok(protected)
    }

    fn unprotect_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob_from_bytes(bytes);
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
        if result == 0 {
            return Err(format!(
                "DPAPI decryption failed: {}",
                std::io::Error::last_os_error()
            ));
        }

        let secret =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
        unsafe {
            LocalFree(output.pbData as *mut _);
        }
        Ok(secret)
    }

    pub fn save_provider_secret(
        app_data_dir: &Path,
        provider_id: &str,
        secret_key: &str,
        value: &str,
    ) -> Result<(), String> {
        let key = provider_secret_storage_key(provider_id, secret_key);
        let encrypted = protect_bytes(value.as_bytes())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(encrypted);

        let mut file = load_provider_secret_file(app_data_dir)?;
        file.entries.insert(key, encoded);
        save_provider_secret_file(app_data_dir, &file)
    }

    pub fn read_provider_secret(
        app_data_dir: &Path,
        provider_id: &str,
        secret_key: &str,
    ) -> Result<Option<String>, String> {
        let key = provider_secret_storage_key(provider_id, secret_key);
        let file = load_provider_secret_file(app_data_dir)?;
        let encoded = match file.entries.get(&key) {
            Some(value) => value,
            None => return Ok(None),
        };

        let encrypted = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| format!("Could not decode provider secret store entry: {}", error))?;
        let decrypted = unprotect_bytes(&encrypted)?;
        let value = String::from_utf8(decrypted)
            .map_err(|error| format!("Provider secret store contained invalid UTF-8: {}", error))?;
        Ok(Some(value))
    }

    pub fn delete_provider_secret(
        app_data_dir: &Path,
        provider_id: &str,
        secret_key: &str,
    ) -> Result<(), String> {
        let key = provider_secret_storage_key(provider_id, secret_key);
        let mut file = load_provider_secret_file(app_data_dir)?;
        if file.entries.remove(&key).is_none() {
            return Ok(());
        }

        if file.entries.is_empty() {
            let path = provider_secret_file_path(app_data_dir);
            match std::fs::remove_file(&path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("Could not remove provider secret store: {}", error)),
            }
        } else {
            save_provider_secret_file(app_data_dir, &file)
        }
    }
}

#[cfg(target_os = "windows")]
pub fn save_provider_secret(
    app_data_dir: &Path,
    provider_id: &str,
    secret_key: &str,
    value: &str,
) -> Result<(), String> {
    windows::save_provider_secret(app_data_dir, provider_id, secret_key, value)
}

#[cfg(not(target_os = "windows"))]
pub fn save_provider_secret(
    _app_data_dir: &Path,
    _provider_id: &str,
    _secret_key: &str,
    _value: &str,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn read_provider_secret(
    app_data_dir: &Path,
    provider_id: &str,
    secret_key: &str,
) -> Result<Option<String>, String> {
    windows::read_provider_secret(app_data_dir, provider_id, secret_key)
}

#[cfg(not(target_os = "windows"))]
pub fn read_provider_secret(
    _app_data_dir: &Path,
    _provider_id: &str,
    _secret_key: &str,
) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
pub fn delete_provider_secret(
    app_data_dir: &Path,
    provider_id: &str,
    secret_key: &str,
) -> Result<(), String> {
    windows::delete_provider_secret(app_data_dir, provider_id, secret_key)
}

#[cfg(not(target_os = "windows"))]
pub fn delete_provider_secret(
    _app_data_dir: &Path,
    _provider_id: &str,
    _secret_key: &str,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::provider_secret_storage_key;

    #[test]
    fn provider_secret_storage_key_is_stable() {
        assert_eq!(
            provider_secret_storage_key("ollama", "cookieHeader"),
            "ollama::cookieHeader"
        );
    }
}
