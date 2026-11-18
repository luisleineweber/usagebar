use super::*;
use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

#[derive(Clone)]
pub(crate) struct TestStore {
    target: Target,
    pub(crate) fail_stage: Arc<AtomicBool>,
    pub(crate) fail_commit: Arc<AtomicBool>,
}
#[derive(Serialize, Deserialize)]
struct State {
    current: Option<String>,
    recovery: Option<Recovery>,
}
impl TestStore {
    pub(crate) fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("usagebar-refresh-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let store = Self::open(dir);
        store
            .update(|state| {
                state.current = Some(document("refresh"));
                Ok(())
            })
            .unwrap();
        store
    }
    pub(crate) fn open(dir: PathBuf) -> Self {
        Self {
            target: Target {
                data_dir: dir,
                secret_key: "account:a:authJson".into(),
            },
            fail_stage: Arc::new(AtomicBool::new(false)),
            fail_commit: Arc::new(AtomicBool::new(false)),
        }
    }
    fn update<T>(
        &self,
        operation: impl FnOnce(&mut State) -> Result<T, String>,
    ) -> Result<T, String> {
        let _lock = crate::file_lock::exclusive(&self.target.data_dir.join("fixture.lock"), true)?;
        let path = self.target.data_dir.join("fixture.json");
        let mut state = if path.exists() {
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap()
        } else {
            State {
                current: None,
                recovery: None,
            }
        };
        let result = operation(&mut state)?;
        crate::atomic_file::write(&path, &serde_json::to_vec(&state).unwrap()).unwrap();
        Ok(result)
    }
    pub(crate) fn replace(&self, current: Option<String>) {
        self.update(|state| {
            state.current = current;
            state.recovery = None;
            Ok(())
        })
        .unwrap();
    }
    fn matches(state: &State, record: &Recovery) -> bool {
        state
            .current
            .as_deref()
            .is_some_and(|doc| doc == record.previous || doc == record.updated)
    }
}
impl CredentialStore for TestStore {
    fn target(&self) -> &Target {
        &self.target
    }
    fn read(&self) -> Result<Option<String>, String> {
        self.update(|state| Ok(state.current.clone()))
    }
    fn recovery(&self) -> Result<Option<Recovery>, String> {
        self.update(|state| Ok(state.recovery.clone()))
    }
    fn stage(&self, record: &Recovery) -> Result<Applied, String> {
        if self.fail_stage.load(Ordering::SeqCst) {
            return Err("fixture recovery write failed".into());
        }
        self.update(|state| {
            if !Self::matches(state, record) {
                state.recovery = None;
                return Ok(Applied::Replaced);
            }
            state.recovery = Some(record.clone());
            Ok(Applied::Saved)
        })
    }
    fn commit(&self, record: &Recovery) -> Result<Applied, String> {
        if self.fail_commit.load(Ordering::SeqCst) {
            return Err("fixture main write failed".into());
        }
        self.update(|state| {
            if state.recovery.as_ref() != Some(record) || !Self::matches(state, record) {
                state.recovery = None;
                return Ok(Applied::Replaced);
            }
            state.current = Some(record.updated.clone());
            state.recovery = None;
            Ok(Applied::Saved)
        })
    }
}
fn document(token: &str) -> String {
    serde_json::json!({ "usagebarCredentialOwner": "usagebar", "claudeAiOauth": { "accessToken": "old", "refreshToken": token, "expiresAt": 1, "extra": true }, "unrelated": { "keep": true } }).to_string()
}
fn response() -> HttpRespParams {
    HttpRespParams {
        status: 200,
        headers: Default::default(),
        body_text: r#"{"access_token":"new","refresh_token":"rotated","expires_in":3600}"#.into(),
    }
}
fn locks() -> PathBuf {
    std::env::temp_dir().join(format!("usagebar-chain-locks-{}", uuid::Uuid::new_v4()))
}

#[test]
fn preserves_document_rotation_and_missing_refresh_token() {
    for rotate in [false, true] {
        let store = TestStore::new();
        let outcome = Coordinator::default()
            .refresh(&locks(), &store, "old", |token| {
                assert_eq!(token, "refresh");
                let mut response = response();
                if !rotate {
                    response.body_text = r#"{"access_token":"new"}"#.into();
                }
                Ok(response)
            })
            .unwrap();
        let saved: Value = serde_json::from_str(outcome.credentials.as_ref().unwrap()).unwrap();
        assert_eq!(
            saved["claudeAiOauth"]["refreshToken"],
            if rotate { "rotated" } else { "refresh" }
        );
        assert_eq!(saved["claudeAiOauth"]["extra"], true);
        assert_eq!(saved["unrelated"]["keep"], true);
        assert!(store.recovery().unwrap().is_none());
    }
}
#[test]
fn recovery_survives_a_new_coordinator() {
    let store = TestStore::new();
    let dir = locks();
    store.fail_commit.store(true, Ordering::SeqCst);
    assert_eq!(
        Coordinator::default()
            .refresh(&dir, &store, "old", |_| Ok(response()))
            .err()
            .unwrap(),
        SAVE_ERROR
    );
    assert!(store.recovery().unwrap().is_some());
    store.fail_commit.store(false, Ordering::SeqCst);
    let replay = Coordinator::default()
        .refresh(&dir, &store, "old", |_| panic!("must replay after restart"))
        .unwrap();
    assert!(replay.credentials.unwrap().contains("rotated"));
}
#[test]
fn recovery_child() {
    let Some(dir) = std::env::var_os("USAGEBAR_RECOVERY_FIXTURE") else {
        return;
    };
    let store = TestStore::open(PathBuf::from(dir));
    Coordinator::default()
        .refresh(&locks(), &store, "old", |_| {
            panic!("restart must not use the spent token")
        })
        .unwrap();
    assert!(store.read().unwrap().unwrap().contains("rotated"));
}
#[test]
fn recovery_replays_in_an_actual_new_process() {
    let store = TestStore::new();
    store.fail_commit.store(true, Ordering::SeqCst);
    let _ = Coordinator::default().refresh(&locks(), &store, "old", |_| Ok(response()));
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "plugin_engine::host_api::claude_refresh::tests::recovery_child",
        ])
        .env("USAGEBAR_RECOVERY_FIXTURE", &store.target.data_dir)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("1 passed"));
    assert!(store.read().unwrap().unwrap().contains("rotated"));
}
#[test]
fn overlap_is_excluded_but_other_chains_can_refresh() {
    let dir = locks();
    let coordinator = Coordinator::default();
    let store = TestStore::new();
    let other = TestStore::new();
    other.replace(Some(document("another-chain")));
    coordinator
        .refresh(&dir, &store, "old", |_| {
            assert_eq!(
                coordinator
                    .refresh(&dir, &store, "old", |_| panic!())
                    .err()
                    .unwrap(),
                BUSY
            );
            Coordinator::default()
                .refresh(&dir, &other, "old", |_| Ok(response()))
                .unwrap();
            Ok(response())
        })
        .unwrap();
}
#[test]
fn failed_recovery_write_retains_memory_until_replaced_or_removed() {
    for removed in [false, true] {
        let dir = locks();
        let coordinator = Coordinator::default();
        let store = TestStore::new();
        store.fail_stage.store(true, Ordering::SeqCst);
        assert_eq!(
            coordinator
                .refresh(&dir, &store, "old", |_| Ok(response()))
                .err()
                .unwrap(),
            SAVE_ERROR
        );
        assert_eq!(
            Coordinator::default()
                .refresh(&dir, &store, "old", |_| panic!())
                .err()
                .unwrap(),
            BUSY
        );
        store.fail_stage.store(false, Ordering::SeqCst);
        store.replace(if removed {
            None
        } else {
            Some(document("replacement"))
        });
        assert!(
            coordinator
                .refresh(&dir, &store, "old", |_| panic!())
                .err()
                .unwrap()
                .contains("replaced or removed")
        );
        assert!(coordinator.pending.lock().unwrap().is_empty());
        let original_chain = TestStore::new();
        Coordinator::default()
            .refresh(&dir, &original_chain, "old", |_| Ok(response()))
            .unwrap();
    }
}
#[test]
fn replaced_or_deleted_durable_recovery_cannot_restore_a_profile() {
    let store = TestStore::new();
    store.fail_commit.store(true, Ordering::SeqCst);
    let _ = Coordinator::default().refresh(&locks(), &store, "old", |_| Ok(response()));
    let record = store.recovery().unwrap().unwrap();
    store.replace(None);
    store.fail_commit.store(false, Ordering::SeqCst);
    assert_eq!(store.commit(&record).unwrap(), Applied::Replaced);
    assert!(store.read().unwrap().is_none());
}
#[test]
fn stale_callers_reload_and_rejected_requests_do_not_write() {
    let store = TestStore::new();
    let dir = locks();
    let coordinator = Coordinator::default();
    coordinator
        .refresh(&dir, &store, "old", |_| Ok(response()))
        .unwrap();
    coordinator
        .refresh(&dir, &store, "old", |_| panic!("stale caller"))
        .unwrap();
    let store = TestStore::new();
    let outcome = coordinator
        .refresh(&dir, &store, "old", |_| {
            let mut r = response();
            r.status = 429;
            Ok(r)
        })
        .unwrap();
    assert_eq!(outcome.response.unwrap().status, 429);
    assert!(store.recovery().unwrap().is_none());
}

#[test]
fn chain_lock_child() {
    let Some(path) = std::env::var_os("USAGEBAR_CHAIN_TEST_LOCK") else {
        return;
    };
    assert!(
        crate::file_lock::exclusive(Path::new(&path), false)
            .unwrap()
            .is_none()
    );
}
#[test]
fn overlapping_process_cannot_rotate_the_same_chain() {
    let store = TestStore::new();
    let dir = locks();
    Coordinator::default()
        .refresh(&dir, &store, "old", |_| {
            let path = chain_path(&dir, &store.read().unwrap().unwrap()).unwrap();
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "plugin_engine::host_api::claude_refresh::tests::chain_lock_child",
                ])
                .env("USAGEBAR_CHAIN_TEST_LOCK", path)
                .output()
                .unwrap();
            assert!(output.status.success());
            assert!(String::from_utf8_lossy(&output.stdout).contains("1 passed"));
            Ok(response())
        })
        .unwrap();
}
