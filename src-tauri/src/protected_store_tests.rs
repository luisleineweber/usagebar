use super::*;
use std::path::PathBuf;
use std::process::{Command, Stdio};
const KEY: &str = "account:selected:authJson";
fn fixture() -> (PathBuf, Recovery) {
    let dir =
        std::env::temp_dir().join(format!("usagebar-protected-store-{}", uuid::Uuid::new_v4()));
    let record = Recovery {
        previous: r#"{"accessToken":"synthetic-old"}"#.into(),
        updated: r#"{"accessToken":"synthetic-rotated"}"#.into(),
    };
    save(&dir, "claude", KEY, &record.previous).unwrap();
    transaction(&dir, |store| store.stage(KEY, &record)).unwrap();
    (dir, record)
}
fn child(dir: &Path, action: &str) -> std::process::Child {
    Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "protected_store::tests::mutation_child"])
        .env("USAGEBAR_STORE_TEST_DIR", dir)
        .env("USAGEBAR_STORE_TEST_ACTION", action)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
}
fn finish(child: std::process::Child) {
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{} {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("1 passed"));
}
#[test]
fn mutation_child() {
    let Some(dir) = std::env::var_os("USAGEBAR_STORE_TEST_DIR") else {
        return;
    };
    let dir = PathBuf::from(dir);
    std::fs::write(dir.join("started"), b"ready").unwrap();
    match std::env::var("USAGEBAR_STORE_TEST_ACTION")
        .unwrap()
        .as_str()
    {
        "other" => save(&dir, "codex", "other", "synthetic-other").unwrap(),
        "delete" => delete(&dir, "claude", KEY).unwrap(),
        "replace" => save(&dir, "claude", KEY, "synthetic-replacement").unwrap(),
        "recover" => transaction(&dir, |store| {
            let record = store.recovery(KEY)?.expect("durable recovery");
            assert_eq!(store.commit(KEY, &record)?, Applied::Saved);
            Ok(())
        })
        .unwrap(),
        _ => panic!("unknown fixture action"),
    }
}
#[test]
fn protected_recovery_replays_after_process_restart() {
    let (dir, record) = fixture();
    let file = std::fs::read_to_string(dir.join("provider-secrets.json")).unwrap();
    assert!(!file.contains("synthetic-old"));
    assert!(!file.contains("synthetic-rotated"));
    finish(child(&dir, "recover"));
    transaction(&dir, |store| {
        assert_eq!(
            store.read("claude", KEY)?.as_deref(),
            Some(record.updated.as_str())
        );
        assert!(store.recovery(KEY)?.is_none());
        Ok(())
    })
    .unwrap();
}
#[test]
fn concurrent_other_provider_mutation_preserves_rotation() {
    let (dir, record) = fixture();
    let (process, commit) = transaction(&dir, |store| {
        let process = child(&dir, "other");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !dir.join("started").exists() {
            assert!(std::time::Instant::now() < deadline, "child did not start");
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let commit = store.commit(KEY, &record);
        Ok((process, commit))
    })
    .unwrap();
    finish(process);
    assert_eq!(commit.unwrap(), Applied::Saved);
    transaction(&dir, |store| {
        assert_eq!(
            store.read("claude", KEY)?.as_deref(),
            Some(record.updated.as_str())
        );
        assert_eq!(
            store.read("codex", "other")?.as_deref(),
            Some("synthetic-other")
        );
        Ok(())
    })
    .unwrap();
}
#[test]
fn delete_or_replace_in_another_process_cannot_be_undone_by_refresh() {
    for action in ["delete", "replace"] {
        let (dir, record) = fixture();
        finish(child(&dir, action));
        transaction(&dir, |store| {
            assert_eq!(store.commit(KEY, &record)?, Applied::Replaced);
            assert!(store.recovery(KEY)?.is_none());
            assert_eq!(
                store.read("claude", KEY)?.as_deref(),
                if action == "delete" {
                    None
                } else {
                    Some("synthetic-replacement")
                }
            );
            Ok(())
        })
        .unwrap();
    }
}

#[test]
fn recovery_can_be_written_when_main_store_is_unreadable() {
    let (dir, record) = fixture();
    let path = dir.join("provider-secrets.json");
    std::fs::rename(&path, dir.join("main.backup")).unwrap();
    std::fs::create_dir(&path).unwrap();
    transaction(&dir, |store| {
        assert_eq!(store.stage(KEY, &record)?, Applied::Saved);
        assert!(store.commit(KEY, &record).is_err());
        assert_eq!(store.recovery(KEY)?.unwrap().updated, record.updated);
        Ok(())
    })
    .unwrap();
    std::fs::remove_dir(&path).unwrap();
    std::fs::rename(dir.join("main.backup"), &path).unwrap();
    finish(child(&dir, "recover"));
}
