use super::tests::{document, locks, response};
use super::*;

fn imported() -> crate::provider_account_store::ImportedProviderAccount {
    crate::provider_account_store::ImportedProviderAccount {
        label: "Synthetic account".into(),
        email: None,
        account_id: Some("fixture".into()),
    }
}
fn fixture() -> (Target, PathBuf) {
    let data_dir = locks();
    let profile =
        crate::provider_account_store::import_profile(&data_dir, "claude", imported(), 1).unwrap();
    let target = Target {
        data_dir: data_dir.clone(),
        secret_key: format!("account:{}:authJson", profile.profile_id),
    };
    crate::protected_store::save(
        &data_dir,
        "claude",
        &target.secret_key,
        &document("refresh"),
    )
    .unwrap();
    (target, locks())
}
fn profile_id(target: &Target) -> &str {
    target
        .secret_key
        .strip_prefix("account:")
        .unwrap()
        .strip_suffix(":authJson")
        .unwrap()
}
fn unsaved(target: &Target, dir: &Path) -> Coordinator {
    let coordinator = Coordinator::default();
    assert_eq!(
        coordinator
            .refresh(dir, target, "old", |_| {
                std::fs::write(
                    target.data_dir.join("claude-refresh-recovery"),
                    b"fixture blocker",
                )
                .unwrap();
                let main = target.data_dir.join("provider-secrets.json");
                std::fs::rename(&main, target.data_dir.join("main.backup")).unwrap();
                std::fs::create_dir(&main).unwrap();
                Ok(response())
            })
            .err()
            .unwrap(),
        UNSAVED_ERROR
    );
    assert!(
        coordinator
            .pending
            .contains(&target.data_dir, &target.secret_key)
    );
    coordinator
}
fn repair(target: &Target) {
    std::fs::remove_dir(target.data_dir.join("provider-secrets.json")).unwrap();
    std::fs::rename(
        target.data_dir.join("main.backup"),
        target.data_dir.join("provider-secrets.json"),
    )
    .unwrap();
    std::fs::remove_file(target.data_dir.join("claude-refresh-recovery")).unwrap();
}
#[test]
fn recovery_write_failure_still_saves_to_writable_main_store() {
    let (target, dir) = fixture();
    let result = Coordinator::default()
        .refresh(&dir, &target, "old", |_| {
            std::fs::write(
                target.data_dir.join("claude-refresh-recovery"),
                b"fixture blocker",
            )
            .unwrap();
            Ok(response())
        })
        .unwrap();
    assert!(result.credentials.unwrap().contains("rotated"));
    assert!(target.read().unwrap().unwrap().contains("rotated"));
    assert!(!pending_rotations().contains(&target.data_dir, &target.secret_key));
}
#[test]
fn production_delete_releases_pending_chain_without_an_old_profile_probe() {
    let (target, dir) = fixture();
    let _coordinator = unsaved(&target, &dir);
    repair(&target);
    assert!(
        crate::provider_account_store::delete_profile_with_credentials(
            &target.data_dir,
            "claude",
            profile_id(&target)
        )
        .unwrap()
        .is_some()
    );
    assert!(!pending_rotations().contains(&target.data_dir, &target.secret_key));
    assert!(target.read().unwrap().is_none());
    let new_profile =
        crate::provider_account_store::import_profile(&target.data_dir, "claude", imported(), 2)
            .unwrap();
    assert_ne!(new_profile.profile_id, profile_id(&target));
    let new_target = Target {
        data_dir: target.data_dir.clone(),
        secret_key: format!("account:{}:authJson", new_profile.profile_id),
    };
    crate::protected_store::save(
        &new_target.data_dir,
        "claude",
        &new_target.secret_key,
        &document("refresh"),
    )
    .unwrap();
    Coordinator::default()
        .refresh(&dir, &new_target, "old", |_| Ok(response()))
        .unwrap();
}
#[test]
fn production_replace_releases_pending_chain_without_an_old_profile_probe() {
    let (target, dir) = fixture();
    let _coordinator = unsaved(&target, &dir);
    repair(&target);
    let mut replacement: Value = serde_json::from_str(&document("replacement")).unwrap();
    replacement["usagebarCredentialOwner"] = Value::String("claude-code".into());
    crate::protected_store::save(
        &target.data_dir,
        "claude",
        &target.secret_key,
        &replacement.to_string(),
    )
    .unwrap();
    assert!(!pending_rotations().contains(&target.data_dir, &target.secret_key));
    let old_chain = chain_path(&dir, &document("refresh")).unwrap();
    assert!(
        crate::file_lock::exclusive(&old_chain, false)
            .unwrap()
            .is_some()
    );
}
#[test]
fn failed_credential_delete_keeps_profile_available_for_retry() {
    let (target, dir) = fixture();
    let _coordinator = unsaved(&target, &dir);
    assert!(
        crate::provider_account_store::delete_profile_with_credentials(
            &target.data_dir,
            "claude",
            profile_id(&target)
        )
        .is_err()
    );
    assert!(
        crate::provider_account_store::list_profiles(&target.data_dir, "claude")
            .unwrap()
            .iter()
            .any(|profile| profile.profile_id == profile_id(&target))
    );
    repair(&target);
    assert!(
        crate::provider_account_store::delete_profile_with_credentials(
            &target.data_dir,
            "claude",
            profile_id(&target)
        )
        .unwrap()
        .is_some()
    );
    assert!(!pending_rotations().contains(&target.data_dir, &target.secret_key));
}
