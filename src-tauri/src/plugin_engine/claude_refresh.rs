//! Claude refresh transactions. Credential values never enter logs or lock paths.
use super::HttpRespParams;
use crate::protected_store::{
    Applied, PendingRotation, PendingRotations, Recovery, pending_rotations,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::path::{Path, PathBuf};

pub(super) const SAVE_ERROR: &str = "Could not save refreshed Claude credentials. Recovery will run before another refresh. Retry the probe.";
pub(super) const BUSY: &str = crate::protected_store::REFRESH_BUSY;
pub(super) const UNSAVED_ERROR: &str = "Refreshed Claude credentials are unsaved. Recovery and main storage both failed. Keep UsageBar open and retry.";
const REPLACED: &str = "The managed Claude account was replaced or removed. Select or re-import the account in Settings.";

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct Target {
    pub(super) data_dir: PathBuf,
    pub(super) secret_key: String,
}
pub(super) trait CredentialStore {
    fn target(&self) -> &Target;
    fn supports_refresh(&self) -> bool;
    fn read(&self) -> Result<Option<String>, String>;
    fn recovery(&self) -> Result<Option<Recovery>, String>;
    fn stage(&self, record: &Recovery) -> Result<Applied, String>;
    fn commit(&self, record: &Recovery) -> Result<Applied, String>;
    fn commit_direct(&self, record: &Recovery) -> Result<Applied, String>;
}
impl CredentialStore for Target {
    fn supports_refresh(&self) -> bool {
        cfg!(target_os = "windows")
    }
    fn target(&self) -> &Target {
        self
    }
    fn read(&self) -> Result<Option<String>, String> {
        crate::protected_store::transaction(&self.data_dir, |store| {
            store.read("claude", &self.secret_key)
        })
    }
    fn recovery(&self) -> Result<Option<Recovery>, String> {
        crate::protected_store::transaction(&self.data_dir, |store| {
            store.recovery(&self.secret_key)
        })
    }
    fn stage(&self, record: &Recovery) -> Result<Applied, String> {
        crate::protected_store::transaction(&self.data_dir, |store| {
            store.stage(&self.secret_key, record)
        })
    }
    fn commit(&self, record: &Recovery) -> Result<Applied, String> {
        crate::protected_store::transaction(&self.data_dir, |store| {
            store.commit(&self.secret_key, record)
        })
    }
    fn commit_direct(&self, record: &Recovery) -> Result<Applied, String> {
        crate::protected_store::transaction(&self.data_dir, |store| {
            store.commit_direct(&self.secret_key, record)
        })
    }
}
pub(super) struct Coordinator {
    pending: &'static PendingRotations,
}
impl Default for Coordinator {
    fn default() -> Self {
        Self {
            pending: pending_rotations(),
        }
    }
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Outcome {
    credentials: Option<String>,
    response: Option<HttpRespParams>,
}

fn chain_path(directory: &Path, document: &str) -> Result<PathBuf, String> {
    let full: Value =
        serde_json::from_str(document).map_err(|_| "Invalid managed Claude credential document")?;
    let token = full["claudeAiOauth"]["refreshToken"]
        .as_str()
        .filter(|token| !token.is_empty())
        .ok_or("Managed Claude credentials have no refresh token")?;
    Ok(directory.join(format!("{:x}.lock", Sha256::digest(token.as_bytes()))))
}
impl Coordinator {
    fn persist(
        &self,
        store: &impl CredentialStore,
        record: Recovery,
        lock: File,
    ) -> Result<Outcome, String> {
        let target = store.target();
        // Register before I/O, so a successful replace/delete can cancel even
        // an active persistence attempt without waiting for another old probe.
        self.pending.begin(
            &target.data_dir,
            &target.secret_key,
            PendingRotation {
                record: record.clone(),
                lock,
            },
        )?;
        let recovery_written = match store.stage(&record) {
            Ok(Applied::Saved) => true,
            Ok(Applied::Replaced) => {
                self.pending
                    .finish(&target.data_dir, &target.secret_key, &record)?;
                return Err(REPLACED.into());
            }
            Err(_) => false,
        };
        let result = if recovery_written {
            store.commit(&record)
        } else {
            log::warn!("Claude recovery write failed; attempting a verified main-store write");
            store.commit_direct(&record)
        };
        match result {
            Ok(Applied::Saved) => {
                self.pending
                    .finish(&target.data_dir, &target.secret_key, &record)?;
                Ok(Outcome {
                    credentials: Some(record.updated),
                    response: None,
                })
            }
            Ok(Applied::Replaced) => {
                self.pending
                    .finish(&target.data_dir, &target.secret_key, &record)?;
                Err(REPLACED.into())
            }
            Err(_) if recovery_written => {
                self.pending
                    .finish(&target.data_dir, &target.secret_key, &record)?;
                Err(SAVE_ERROR.into())
            }
            Err(_) => {
                if self
                    .pending
                    .retryable(&target.data_dir, &target.secret_key, &record)?
                {
                    Err(UNSAVED_ERROR.into())
                } else {
                    Err(REPLACED.into())
                }
            }
        }
    }

    pub(super) fn refresh(
        &self,
        directory: &Path,
        store: &impl CredentialStore,
        expected_access: &str,
        request: impl FnOnce(&str) -> Result<HttpRespParams, String>,
    ) -> Result<Outcome, String> {
        if !store.supports_refresh() {
            return Err(crate::protected_store::UNSUPPORTED_RECOVERY.into());
        }
        let target = store.target();
        let memory = self.pending.take(&target.data_dir, &target.secret_key)?;
        if let Some(pending) = memory {
            return self.persist(store, pending.record, pending.lock);
        }
        let recovery = store.recovery()?;
        let seed = match recovery {
            Some(record) => record.previous,
            None => store.read()?.ok_or(REPLACED)?,
        };
        let path = chain_path(directory, &seed)?;
        let lock = crate::file_lock::exclusive(&path, false)?.ok_or(BUSY)?;
        // Reload under the chain lock. Recovery always precedes another request.
        if let Some(record) = store.recovery()? {
            return self.persist(store, record, lock);
        }
        let previous = store.read()?.ok_or(REPLACED)?;
        if chain_path(directory, &previous)? != path {
            return Ok(Outcome {
                credentials: Some(previous),
                response: None,
            });
        }
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
        let expires_at = body
            .get("expires_in")
            .and_then(Value::as_f64)
            .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
            .and_then(|seconds| {
                let expires = time::OffsetDateTime::now_utc().unix_timestamp_nanos() as f64
                    / 1_000_000.0
                    + seconds * 1000.0;
                serde_json::Number::from_f64(expires)
            })
            .map(Value::Number)
            .unwrap_or(Value::Null);
        oauth.insert("expiresAt".into(), expires_at);

        self.persist(
            store,
            Recovery {
                previous,
                updated: full.to_string(),
            },
            lock,
        )
    }
}

#[cfg(test)]
#[path = "claude_refresh_tests.rs"]
pub(super) mod tests;

#[cfg(all(test, target_os = "windows"))]
#[path = "claude_refresh_native_tests.rs"]
mod native_tests;
