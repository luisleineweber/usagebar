//! Protected credential operations. Every mutation uses the same OS store lock.
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct Recovery {
    pub(crate) previous: String,
    pub(crate) updated: String,
}
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Applied {
    Saved,
    Replaced,
}

pub(crate) const REFRESH_BUSY: &str = "Claude credential refresh is busy. Try again.";
pub(crate) const UNSUPPORTED_RECOVERY: &str =
    "Direct Claude refresh and recovery are supported only on Windows.";

#[path = "pending_refresh.rs"]
mod pending_refresh;
pub(crate) use pending_refresh::{PendingRotation, PendingRotations, pending_rotations};

pub(crate) fn lock(data_dir: &Path) -> Result<std::fs::File, String> {
    #[cfg(target_os = "windows")]
    let path = data_dir.join("provider-secrets.lock");
    #[cfg(not(target_os = "windows"))]
    let path = {
        let _ = data_dir;
        dirs::home_dir()
            .ok_or("Home directory is unavailable")?
            .join(".usagebar/provider-secrets.lock")
    };
    crate::file_lock::exclusive(&path, true)?
        .ok_or_else(|| "Could not lock credential store".into())
}

pub(crate) struct Store<'a> {
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    data_dir: &'a Path,
}
pub(crate) fn transaction<T>(
    dir: &Path,
    operation: impl FnOnce(&Store<'_>) -> Result<T, String>,
) -> Result<T, String> {
    let _lock = lock(dir)?;
    operation(&Store { data_dir: dir })
}
impl Store<'_> {
    pub(crate) fn read(&self, provider: &str, key: &str) -> Result<Option<String>, String> {
        #[cfg(target_os = "windows")]
        {
            crate::provider_secret_store::windows::read_provider_secret(
                self.data_dir,
                provider,
                key,
            )
        }
        #[cfg(not(target_os = "windows"))]
        {
            match vault_entry(provider, key)?.get_password() {
                Ok(value) => Ok(Some(value)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err("Could not read protected credential".into()),
            }
        }
    }
    fn write(&self, provider: &str, key: &str, value: &str) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            crate::provider_secret_store::windows::save_provider_secret(
                self.data_dir,
                provider,
                key,
                value,
            )
        }
        #[cfg(not(target_os = "windows"))]
        {
            vault_entry(provider, key)?
                .set_password(value)
                .map_err(|_| "Could not write protected credential".into())
        }
    }
    fn remove(&self, provider: &str, key: &str) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            crate::provider_secret_store::windows::delete_provider_secret(
                self.data_dir,
                provider,
                key,
            )
        }
        #[cfg(not(target_os = "windows"))]
        {
            match vault_entry(provider, key)?.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err("Could not remove protected credential".into()),
            }
        }
    }
    pub(crate) fn recovery(&self, key: &str) -> Result<Option<Recovery>, String> {
        #[cfg(target_os = "windows")]
        {
            let bytes = match std::fs::read(self.recovery_path(key)) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err("Could not read protected Claude recovery".into()),
            };
            let bytes = crate::provider_secret_store::windows::unprotect_bytes(&bytes)?;
            serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(|_| "Invalid protected Claude recovery record".into())
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = key;
            Err(UNSUPPORTED_RECOVERY.into())
        }
    }
    #[cfg(target_os = "windows")]
    fn recovery_path(&self, key: &str) -> std::path::PathBuf {
        use sha2::{Digest, Sha256};
        self.data_dir
            .join("claude-refresh-recovery")
            .join(format!("{:x}.bin", Sha256::digest(key.as_bytes())))
    }
    fn write_recovery(&self, key: &str, record: &Recovery) -> Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            let text = serde_json::to_string(record)
                .map_err(|_| "Could not encode Claude recovery record")?;
            let path = self.recovery_path(key);
            std::fs::create_dir_all(path.parent().ok_or("Invalid Claude recovery path")?)
                .map_err(|_| "Could not create Claude recovery directory")?;
            let encrypted = crate::provider_secret_store::windows::protect_bytes(text.as_bytes())?;
            crate::atomic_file::write(&path, &encrypted)
                .map_err(|_| "Could not write protected Claude recovery")?;
            Ok(())
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = (key, record);
            Err(UNSUPPORTED_RECOVERY.into())
        }
    }
    fn clear_recovery(&self, provider: &str, key: &str) -> Result<(), String> {
        if provider != "claude" {
            return Ok(());
        }
        #[cfg(target_os = "windows")]
        {
            match std::fs::remove_file(self.recovery_path(key)) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(_) => Err("Could not clear protected Claude recovery".into()),
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = key;
            Ok(())
        }
    }
    pub(crate) fn save(&self, provider: &str, key: &str, value: &str) -> Result<(), String> {
        self.write(provider, key, value)?;
        if provider == "claude" {
            pending_rotations().discard(self.data_dir, key)?;
        }
        self.clear_recovery(provider, key)
    }
    pub(crate) fn delete(&self, provider: &str, key: &str) -> Result<(), String> {
        self.remove(provider, key)?;
        if provider == "claude" {
            pending_rotations().discard(self.data_dir, key)?;
        }
        self.clear_recovery(provider, key)
    }
    fn matches(&self, key: &str, record: &Recovery) -> Result<bool, String> {
        let current = self.read("claude", key)?;
        Ok(current.as_deref().is_some_and(|value| {
            same_document(value, &record.previous) || same_document(value, &record.updated)
        }))
    }
    pub(crate) fn stage(&self, key: &str, record: &Recovery) -> Result<Applied, String> {
        if let Some(existing) = self.recovery(key)? {
            if existing != *record {
                return Err("A different Claude rotation is waiting for recovery".into());
            }
        }
        self.write_recovery(key, record)?;
        Ok(Applied::Saved)
    }
    pub(crate) fn commit(&self, key: &str, record: &Recovery) -> Result<Applied, String> {
        // Compare, replace and clear the journal under one cross-process lock.
        if self.recovery(key)?.as_ref() != Some(record) {
            return Ok(Applied::Replaced);
        }
        let result = self.replace_verified(key, record)?;
        self.clear_recovery("claude", key)?;
        Ok(result)
    }
    // Used only when recovery storage failed. This still compares and verifies
    // under the same store lock; missing or replaced credentials are not restored.
    pub(crate) fn commit_direct(&self, key: &str, record: &Recovery) -> Result<Applied, String> {
        let result = self.replace_verified(key, record)?;
        if result == Applied::Saved && self.clear_recovery("claude", key).is_err() {
            log::warn!("Claude recovery cleanup failed after a verified main-store write");
        }
        Ok(result)
    }
    fn replace_verified(&self, key: &str, record: &Recovery) -> Result<Applied, String> {
        if !self.matches(key, record)? {
            return Ok(Applied::Replaced);
        }
        self.write("claude", key, &record.updated)?;
        if self.read("claude", key)?.as_deref() != Some(&record.updated) {
            return Err("Could not verify refreshed Claude credentials".into());
        }
        Ok(Applied::Saved)
    }
}

#[cfg(not(target_os = "windows"))]
fn vault_entry(provider: &str, key: &str) -> Result<keyring::Entry, String> {
    let service = crate::provider_secret_service(provider, key);
    crate::open_provider_secret_entry(crate::provider_secret_entry_spec(&service))
        .map_err(|_| "Could not access the protected credential vault".into())
}
pub(crate) fn save(dir: &Path, provider: &str, key: &str, value: &str) -> Result<(), String> {
    transaction(dir, |store| store.save(provider, key, value))
}
pub(crate) fn delete(dir: &Path, provider: &str, key: &str) -> Result<(), String> {
    transaction(dir, |store| store.delete(provider, key))
}
pub(crate) fn same_document(a: &str, b: &str) -> bool {
    match (
        serde_json::from_str::<serde_json::Value>(a),
        serde_json::from_str::<serde_json::Value>(b),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

#[cfg(all(test, target_os = "windows"))]
#[path = "protected_store_tests.rs"]
mod tests;
