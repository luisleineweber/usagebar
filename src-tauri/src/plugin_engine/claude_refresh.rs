//! Claude refresh transactions. No credential values are logged.
use super::HttpRespParams;
use serde_json::Value;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub(super) const SAVE_ERROR: &str = "Could not save refreshed Claude credentials. The new credentials remain in memory. Retry before closing UsageBar.";
pub(super) const BUSY: &str = "Claude credential refresh is busy. Try again.";

#[derive(Clone, PartialEq, Eq)]
pub(super) struct Target {
    pub(super) data_dir: PathBuf,
    pub(super) secret_key: String,
}
struct Pending {
    target: Target,
    previous: String,
    updated: String,
    _lock: File,
}
#[derive(Default)]
pub(super) struct Coordinator {
    pending: Mutex<Option<Pending>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Outcome {
    credentials: Option<String>,
    response: Option<HttpRespParams>,
}

impl Coordinator {
    pub(super) fn refresh(
        &self,
        lock_path: &Path,
        target: Target,
        expected_access: &str,
        mut read: impl FnMut() -> Result<String, String>,
        request: impl FnOnce(&str) -> Result<HttpRespParams, String>,
        write: impl FnOnce(&str) -> Result<(), String>,
    ) -> Result<Outcome, String> {
        // This mutex also excludes nested calls in one process. The OS lock
        // excludes other UsageBar processes, including dev and release builds.
        let mut pending = self.pending.try_lock().map_err(|_| BUSY.to_string())?;
        if let Some(saved) = pending.as_ref() {
            if saved.target != target {
                return Err(BUSY.into());
            }
            let current = read()?;
            if !same_document(&current, &saved.previous) && !same_document(&current, &saved.updated)
            {
                return Err("Managed Claude credentials changed while a refreshed document was waiting for storage. Re-import the account to resolve it.".into());
            }
            write(&saved.updated).map_err(|_| SAVE_ERROR.to_string())?;
            let credentials = saved.updated.clone();
            // Drop the retained OS lock only after the write is verified.
            *pending = None;
            return Ok(Outcome {
                credentials: Some(credentials),
                response: None,
            });
        }
        let parent = lock_path
            .parent()
            .ok_or("Invalid Claude refresh lock path")?;
        std::fs::create_dir_all(parent)
            .map_err(|_| "Could not create Claude refresh lock directory")?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)
            .map_err(|_| "Could not open Claude refresh lock")?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(std::fs::TryLockError::WouldBlock) => return Err(BUSY.into()),
            Err(_) => return Err("Could not lock Claude credentials for refresh".into()),
        }
        // Always reload inside both locks. A caller may have read the old token
        // before another probe completed rotation.
        let previous = read()?;
        let mut full: Value = serde_json::from_str(&previous)
            .map_err(|_| "Invalid managed Claude credential document")?;
        if full.get("usagebarCredentialOwner").and_then(Value::as_str) != Some("usagebar") {
            return Err("Claude Code owns this credential refresh chain. Run `claude` and re-import the account.".into());
        }
        let oauth = full
            .get_mut("claudeAiOauth")
            .and_then(Value::as_object_mut)
            .ok_or("Invalid managed Claude OAuth credentials")?;
        let current_access = oauth
            .get("accessToken")
            .and_then(Value::as_str)
            .unwrap_or("");
        if current_access != expected_access && !current_access.is_empty() {
            return Ok(Outcome {
                credentials: Some(previous),
                response: None,
            });
        }
        let refresh_token = oauth
            .get("refreshToken")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
            .ok_or("Managed Claude credentials have no refresh token")?;
        let response = match request(refresh_token) {
            Ok(response) => response,
            Err(_) => {
                log::error!("[plugin:claude] refresh connection failed");
                return Ok(Outcome {
                    credentials: None,
                    response: None,
                });
            }
        };
        if !(200..300).contains(&response.status) {
            return Ok(Outcome {
                credentials: None,
                response: Some(response),
            });
        }
        let body: Value = match serde_json::from_str(&response.body_text) {
            Ok(body) => body,
            Err(_) => {
                return Ok(Outcome {
                    credentials: None,
                    response: Some(response),
                });
            }
        };
        let Some(access) = body
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|token| !token.trim().is_empty())
        else {
            return Ok(Outcome {
                credentials: None,
                response: Some(response),
            });
        };
        oauth.insert("accessToken".into(), Value::String(access.into()));
        if let Some(refresh) = body
            .get("refresh_token")
            .and_then(Value::as_str)
            .filter(|token| !token.trim().is_empty())
        {
            oauth.insert("refreshToken".into(), Value::String(refresh.into()));
        }
        if let Some(seconds) = body.get("expires_in").and_then(Value::as_f64) {
            let expires = time::OffsetDateTime::now_utc().unix_timestamp_nanos() as f64
                / 1_000_000.0
                + seconds * 1000.0;
            if let Some(number) = serde_json::Number::from_f64(expires) {
                oauth.insert("expiresAt".into(), Value::Number(number));
            }
        }
        let updated = full.to_string();
        // Retain before calling back into JS/storage. A runtime timeout or write
        // error must not discard a successfully rotated refresh token.
        *pending = Some(Pending {
            target,
            previous,
            updated: updated.clone(),
            _lock: lock,
        });
        let current = read().map_err(|_| SAVE_ERROR.to_string())?;
        let saved = pending
            .as_ref()
            .expect("rotation is retained before storage");
        if !same_document(&current, &saved.previous) && !same_document(&current, &saved.updated) {
            return Err("Managed Claude credentials changed during refresh. The new credentials remain in memory; the stored profile was not replaced.".into());
        }
        write(&updated).map_err(|_| SAVE_ERROR.to_string())?;
        *pending = None;
        Ok(Outcome {
            credentials: Some(updated),
            response: None,
        })
    }
}

fn same_document(a: &str, b: &str) -> bool {
    match (
        serde_json::from_str::<Value>(a),
        serde_json::from_str::<Value>(b),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

#[cfg(test)]
#[path = "claude_refresh_tests.rs"]
mod tests;
