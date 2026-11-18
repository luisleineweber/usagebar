//! Claude refresh transactions. Credential values never enter logs or lock paths.
use super::HttpRespParams;
use crate::protected_store::{Applied, Recovery};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub(super) const SAVE_ERROR: &str = "Could not save refreshed Claude credentials. Recovery will run before another refresh. Retry the probe.";
pub(super) const BUSY: &str = "Claude credential refresh is busy. Try again.";
const REPLACED: &str = "The managed Claude account was replaced or removed. Select or re-import the account in Settings.";

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct Target {
    pub(super) data_dir: PathBuf,
    pub(super) secret_key: String,
}
pub(super) trait CredentialStore {
    fn target(&self) -> &Target;
    fn read(&self) -> Result<Option<String>, String>;
    fn recovery(&self) -> Result<Option<Recovery>, String>;
    fn stage(&self, record: &Recovery) -> Result<Applied, String>;
    fn commit(&self, record: &Recovery) -> Result<Applied, String>;
}
impl CredentialStore for Target {
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
}
struct Pending {
    record: Recovery,
    lock: File,
}
#[derive(Default)]
pub(super) struct Coordinator {
    pending: Mutex<HashMap<Target, Pending>>,
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
        match store.stage(&record) {
            Ok(Applied::Replaced) => return Err(REPLACED.into()),
            Ok(Applied::Saved) => {}
            Err(_) => {
                // If even recovery storage failed, retain both tokens and this chain's
                // lock in the host. Unrelated chains remain usable.
                self.pending
                    .lock()
                    .map_err(|_| BUSY)?
                    .insert(store.target().clone(), Pending { record, lock });
                return Err(SAVE_ERROR.into());
            }
        }
        // The record is now protected and durable. A crash or failed main write is
        // replayable; the chain lock no longer needs to live beyond this call.
        let _lock = lock;
        match store.commit(&record).map_err(|_| SAVE_ERROR)? {
            Applied::Replaced => Err(REPLACED.into()),
            Applied::Saved => Ok(Outcome {
                credentials: Some(record.updated),
                response: None,
            }),
        }
    }
    pub(super) fn refresh(
        &self,
        directory: &Path,
        store: &impl CredentialStore,
        expected_access: &str,
        request: impl FnOnce(&str) -> Result<HttpRespParams, String>,
    ) -> Result<Outcome, String> {
        let memory = self
            .pending
            .lock()
            .map_err(|_| BUSY)?
            .remove(store.target());
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
        if let Some(seconds) = body.get("expires_in").and_then(Value::as_f64) {
            let expires = time::OffsetDateTime::now_utc().unix_timestamp_nanos() as f64
                / 1_000_000.0
                + seconds * 1000.0;
            if let Some(number) = serde_json::Number::from_f64(expires) {
                oauth.insert("expiresAt".into(), Value::Number(number));
            }
        }

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
