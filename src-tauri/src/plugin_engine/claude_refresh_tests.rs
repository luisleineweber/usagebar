use super::*;
use std::cell::RefCell;
fn fixture() -> (PathBuf, Target, String) {
    let dir = std::env::temp_dir().join(format!("usagebar-refresh-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let target = Target {
        data_dir: dir.clone(),
        secret_key: "account:a:authJson".into(),
    };
    let doc = serde_json::json!({ "usagebarCredentialOwner": "usagebar", "claudeAiOauth": { "accessToken": "old", "refreshToken": "refresh", "expiresAt": 1, "extra": true }, "unrelated": { "keep": true } }).to_string();
    (dir.join("refresh.lock"), target, doc)
}
fn response() -> HttpRespParams {
    HttpRespParams {
        status: 200,
        headers: Default::default(),
        body_text: r#"{"access_token":"new","refresh_token":"rotated","expires_in":3600}"#.into(),
    }
}
#[test]
fn preserves_full_document_and_rotated_tokens() {
    let (path, target, doc) = fixture();
    let saved = RefCell::new(String::new());
    let result = Coordinator::default()
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.clone()),
            |token| {
                assert_eq!(token, "refresh");
                Ok(response())
            },
            |value| {
                *saved.borrow_mut() = value.into();
                Ok(())
            },
        )
        .unwrap();
    let updated: Value = serde_json::from_str(result.credentials.as_ref().unwrap()).unwrap();
    assert_eq!(updated["claudeAiOauth"]["refreshToken"], "rotated");
    assert_eq!(updated["claudeAiOauth"]["accessToken"], "new");
    assert_eq!(updated["claudeAiOauth"]["extra"], true);
    assert_eq!(updated["unrelated"]["keep"], true);
    assert_eq!(*saved.borrow(), result.credentials.unwrap());
}
#[test]
fn retains_rotation_and_lock_until_write_succeeds() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    assert_eq!(
        coordinator
            .refresh(
                &path,
                target.clone(),
                "old",
                || Ok(doc.clone()),
                |_| Ok(response()),
                |_| Err("disk full".into())
            )
            .err()
            .unwrap(),
        SAVE_ERROR
    );
    // A separate coordinator represents another process opening the same OS lock.
    assert_eq!(
        Coordinator::default()
            .refresh(
                &path,
                target.clone(),
                "old",
                || panic!("must lock before reading"),
                |_| panic!("must not rotate"),
                |_| panic!()
            )
            .err()
            .unwrap(),
        BUSY
    );
    let retry = coordinator
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.clone()),
            |_| panic!("must retry storage, not rotate"),
            |_| Ok(()),
        )
        .unwrap();
    assert!(retry.credentials.unwrap().contains("rotated"));
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .unwrap();
    file.try_lock().unwrap();
}
#[test]
fn overlap_cannot_rotate_the_same_chain() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    coordinator
        .refresh(
            &path,
            target.clone(),
            "old",
            || Ok(doc.clone()),
            |_| {
                let overlap = coordinator.refresh(
                    &path,
                    target.clone(),
                    "old",
                    || panic!(),
                    |_| panic!("second rotation"),
                    |_| panic!(),
                );
                assert_eq!(overlap.err().unwrap(), BUSY);
                let other_process = Coordinator::default().refresh(
                    &path,
                    target.clone(),
                    "old",
                    || panic!(),
                    |_| panic!("second process rotation"),
                    |_| panic!(),
                );
                assert_eq!(other_process.err().unwrap(), BUSY);
                Ok(response())
            },
            |_| Ok(()),
        )
        .unwrap();
}
#[test]
fn reloads_credentials_after_lock_before_rotating() {
    let (path, target, doc) = fixture();
    let latest = doc.replace("old", "new");
    let result = Coordinator::default()
        .refresh(
            &path,
            target,
            "old",
            || Ok(latest.clone()),
            |_| panic!("stale caller must reuse rotation"),
            |_| panic!(),
        )
        .unwrap();
    assert_eq!(result.credentials.unwrap(), latest);
}
#[test]
fn never_overwrites_a_replaced_profile_with_pending_credentials() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    let _ = coordinator.refresh(
        &path,
        target.clone(),
        "old",
        || Ok(doc.clone()),
        |_| Ok(response()),
        |_| Err("disk full".into()),
    );
    let err = coordinator
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.replace("old", "other-account")),
            |_| panic!(),
            |_| panic!("must not overwrite replacement"),
        )
        .err()
        .unwrap();
    assert!(err.contains("changed"));
}
#[test]
fn process_lock_child() {
    let Some(path) = std::env::var_os("USAGEBAR_REFRESH_TEST_LOCK") else {
        return;
    };
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .unwrap();
    assert!(file.try_lock().is_err(), "another process must be excluded");
}
#[test]
fn excludes_an_actual_separate_process_during_rotation() {
    let (path, target, doc) = fixture();
    Coordinator::default()
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.clone()),
            |_| {
                let output = std::process::Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "plugin_engine::host_api::claude_refresh::tests::process_lock_child",
                    ])
                    .env("USAGEBAR_REFRESH_TEST_LOCK", &path)
                    .output()
                    .unwrap();
                assert!(
                    output.status.success(),
                    "{}",
                    String::from_utf8_lossy(&output.stdout)
                );
                Ok(response())
            },
            |_| Ok(()),
        )
        .unwrap();
}
#[test]
fn pending_profile_does_not_supply_credentials_to_another_profile() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    let _ = coordinator.refresh(
        &path,
        target.clone(),
        "old",
        || Ok(doc.clone()),
        |_| Ok(response()),
        |_| Err("disk full".into()),
    );
    let other = Target {
        secret_key: "account:b:authJson".into(),
        ..target
    };
    assert_eq!(
        coordinator
            .refresh(&path, other, "old", || panic!(), |_| panic!(), |_| panic!())
            .err()
            .unwrap(),
        BUSY
    );
}

#[test]
fn retains_old_refresh_token_when_response_omits_rotation() {
    let (path, target, doc) = fixture();
    let outcome = Coordinator::default()
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.clone()),
            |_| {
                let mut resp = response();
                resp.body_text = r#"{"access_token":"new","expires_in":3600}"#.into();
                Ok(resp)
            },
            |_| Ok(()),
        )
        .unwrap();
    let saved: Value = serde_json::from_str(outcome.credentials.as_ref().unwrap()).unwrap();
    assert_eq!(saved["claudeAiOauth"]["refreshToken"], "refresh");
}

#[test]
fn refuses_cli_owned_documents_even_if_called_directly() {
    let (path, target, doc) = fixture();
    let mut cli: Value = serde_json::from_str(&doc).unwrap();
    cli["usagebarCredentialOwner"] = Value::String("claude-code".into());
    let cli = cli.to_string();
    let err = Coordinator::default()
        .refresh(
            &path,
            target,
            "old",
            || Ok(cli.clone()),
            |_| panic!("CLI-owned refresh"),
            |_| panic!(),
        )
        .err()
        .unwrap();
    assert!(err.contains("Claude Code owns"));
}

#[test]
fn preserves_a_profile_replaced_during_the_request() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    let reads = std::cell::Cell::new(0);
    let result = coordinator.refresh(
        &path,
        target,
        "old",
        || {
            reads.set(reads.get() + 1);
            Ok(if reads.get() == 1 {
                doc.clone()
            } else {
                doc.replace("old", "replacement")
            })
        },
        |_| Ok(response()),
        |_| panic!("must not overwrite the changed profile"),
    );
    assert!(result.err().unwrap().contains("changed during refresh"));
    assert!(coordinator.pending.lock().unwrap().is_some());
}

#[test]
fn transport_failure_and_rejected_refresh_do_not_write_credentials() {
    let (path, target, doc) = fixture();
    let coordinator = Coordinator::default();
    let outcome = coordinator
        .refresh(
            &path,
            target.clone(),
            "old",
            || Ok(doc.clone()),
            |_| Err("offline".into()),
            |_| panic!(),
        )
        .unwrap();
    assert!(outcome.credentials.is_none());
    assert!(coordinator.pending.lock().unwrap().is_none());
    let outcome = coordinator
        .refresh(
            &path,
            target,
            "old",
            || Ok(doc.clone()),
            |_| {
                let mut resp = response();
                resp.status = 429;
                Ok(resp)
            },
            |_| panic!(),
        )
        .unwrap();
    assert_eq!(outcome.response.unwrap().status, 429);
    assert!(coordinator.pending.lock().unwrap().is_none());
}
