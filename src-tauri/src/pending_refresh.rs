//! Process-local recovery for the exceptional case where both stores fail.
//! Store mutations cancel every pending rotation for the changed credential.
use super::{REFRESH_BUSY, Recovery};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub(crate) struct PendingRotation {
    pub(crate) record: Recovery,
    pub(crate) lock: File,
}
struct PendingSlot {
    rotation: PendingRotation,
    active: bool,
}
#[derive(Default)]
pub(crate) struct PendingRotations {
    entries: Mutex<HashMap<(PathBuf, String), Vec<PendingSlot>>>,
}
pub(crate) fn pending_rotations() -> &'static PendingRotations {
    static PENDING: OnceLock<PendingRotations> = OnceLock::new();
    PENDING.get_or_init(PendingRotations::default)
}
impl PendingRotations {
    pub(crate) fn begin(
        &self,
        dir: &Path,
        key: &str,
        rotation: PendingRotation,
    ) -> Result<(), String> {
        // Preserve distinct in-flight rotations if a profile changes during a request.
        self.entries
            .lock()
            .map_err(|_| REFRESH_BUSY)?
            .entry((dir.to_path_buf(), key.into()))
            .or_default()
            .push(PendingSlot {
                rotation,
                active: true,
            });
        Ok(())
    }
    pub(crate) fn take(&self, dir: &Path, key: &str) -> Result<Option<PendingRotation>, String> {
        let mut entries = self.entries.lock().map_err(|_| REFRESH_BUSY)?;
        let key = (dir.to_path_buf(), key.to_string());
        let Some(slots) = entries.get_mut(&key) else {
            return Ok(None);
        };
        if slots.iter().any(|slot| slot.active) {
            return Err(REFRESH_BUSY.into());
        }
        let rotation = slots.pop().map(|slot| slot.rotation);
        if slots.is_empty() {
            entries.remove(&key);
        }
        Ok(rotation)
    }
    pub(crate) fn retryable(
        &self,
        dir: &Path,
        key: &str,
        record: &Recovery,
    ) -> Result<bool, String> {
        let mut entries = self.entries.lock().map_err(|_| REFRESH_BUSY)?;
        if let Some(slots) = entries.get_mut(&(dir.to_path_buf(), key.into())) {
            if let Some(slot) = slots
                .iter_mut()
                .rev()
                .find(|slot| slot.rotation.record == *record)
            {
                slot.active = false;
                return Ok(true);
            }
        }
        Ok(false)
    }
    pub(crate) fn finish(&self, dir: &Path, key: &str, record: &Recovery) -> Result<(), String> {
        let mut entries = self.entries.lock().map_err(|_| REFRESH_BUSY)?;
        let key = (dir.to_path_buf(), key.to_string());
        if let Some(slots) = entries.get_mut(&key) {
            slots.retain(|slot| slot.rotation.record != *record);
            if slots.is_empty() {
                entries.remove(&key);
            }
        }
        Ok(())
    }
    pub(super) fn discard(&self, dir: &Path, key: &str) -> Result<(), String> {
        self.entries
            .lock()
            .map_err(|_| REFRESH_BUSY)?
            .remove(&(dir.to_path_buf(), key.into()));
        Ok(())
    }
    #[cfg(test)]
    pub(crate) fn contains(&self, dir: &Path, key: &str) -> bool {
        self.entries
            .lock()
            .unwrap()
            .contains_key(&(dir.to_path_buf(), key.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinct_unsaved_rotations_keep_their_locks_until_saved_or_canceled() {
        let registry = PendingRotations::default();
        let dir = std::env::temp_dir().join(format!("usagebar-pending-{}", uuid::Uuid::new_v4()));
        let first_path = dir.join("first.lock");
        let second_path = dir.join("second.lock");
        let first = Recovery {
            previous: "synthetic-old-one".into(),
            updated: "synthetic-new-one".into(),
        };
        let second = Recovery {
            previous: "synthetic-old-two".into(),
            updated: "synthetic-new-two".into(),
        };
        registry
            .begin(
                &dir,
                "profile",
                PendingRotation {
                    record: first.clone(),
                    lock: crate::file_lock::exclusive(&first_path, false)
                        .unwrap()
                        .unwrap(),
                },
            )
            .unwrap();
        registry
            .begin(
                &dir,
                "profile",
                PendingRotation {
                    record: second,
                    lock: crate::file_lock::exclusive(&second_path, false)
                        .unwrap()
                        .unwrap(),
                },
            )
            .unwrap();
        assert!(
            crate::file_lock::exclusive(&first_path, false)
                .unwrap()
                .is_none()
        );
        assert!(
            crate::file_lock::exclusive(&second_path, false)
                .unwrap()
                .is_none()
        );
        registry.finish(&dir, "profile", &first).unwrap();
        assert!(
            crate::file_lock::exclusive(&first_path, false)
                .unwrap()
                .is_some()
        );
        assert!(
            crate::file_lock::exclusive(&second_path, false)
                .unwrap()
                .is_none()
        );
        registry.discard(&dir, "profile").unwrap();
        assert!(
            crate::file_lock::exclusive(&second_path, false)
                .unwrap()
                .is_some()
        );
    }
}
