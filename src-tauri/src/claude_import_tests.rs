use super::*;

fn document(access: &str, refresh: &str, expires_at: i64) -> Value {
    serde_json::json!({
        "claudeAiOauth": { "accessToken": access, "refreshToken": refresh, "expiresAt": expires_at },
        "extra": { "keep": true }
    })
}

fn profile(account: &str, organization: &str) -> Profile {
    parse_profile(&serde_json::json!({
        "account": { "uuid": account, "email_address": "fixture@example.test" },
        "organization": { "uuid": organization }
    }))
    .unwrap()
}

fn linked(expiry: i64) -> Value {
    serde_json::from_str(
        &bind(
            document("old", "old-refresh", expiry),
            Source::File,
            profile("a", "org").identity,
        )
        .unwrap(),
    )
    .unwrap()
}

#[test]
fn adopts_newer_credentials_from_only_the_linked_source_and_account() {
    let updated = updated_document(
        &linked(100),
        200,
        |source| {
            assert!(source == Source::File, "must not look at another source");
            Ok(Some(document("new", "new-refresh", 300)))
        },
        |access| {
            assert_eq!(
                access, "new",
                "only the source access token verifies identity"
            );
            Ok(Some(profile("a", "org")))
        },
    )
    .unwrap()
    .unwrap();
    let updated: Value = serde_json::from_str(&updated).unwrap();
    assert_eq!(updated["usagebarCredentialOwner"], "claude-code");
    assert_eq!(updated["claudeAiOauth"]["accessToken"], "new");
    assert_eq!(updated["claudeAiOauth"]["expiresAt"], 300);
    assert_eq!(updated["extra"]["keep"], true);
    assert_eq!(updated[LINK], linked(100)[LINK]);
}

#[test]
fn an_expired_or_missing_source_cannot_update_the_import() {
    for candidate in [None, Some(document("new", "new-refresh", 190))] {
        let outcome = updated_document(
            &linked(100),
            200,
            |source| {
                assert!(source == Source::File);
                Ok(candidate.clone())
            },
            |_| panic!("no valid source access token"),
        )
        .unwrap();
        assert!(outcome.is_none());
    }
}

#[test]
fn rejects_a_different_user_in_the_same_organization_and_a_different_organization() {
    for (account, organization) in [("b", "org"), ("a", "other-org")] {
        let error = updated_document(
            &linked(100),
            200,
            |_| Ok(Some(document("new", "new-refresh", 300))),
            |_| Ok(Some(profile(account, organization))),
        )
        .unwrap_err();
        assert!(error.contains("different account"));
    }
}

#[test]
fn legacy_import_can_link_on_an_exact_credential_match() {
    let old = document("old", "old-refresh", 100);
    let updated = updated_document(
        &old,
        200,
        |source| Ok((source == Source::File).then(|| document("new", "old-refresh", 300))),
        |access| {
            assert_eq!(access, "new");
            Ok(Some(profile("a", "org")))
        },
    )
    .unwrap()
    .unwrap();
    assert!(updated.contains(LINK));
}

#[test]
fn expired_legacy_import_cannot_adopt_an_unrelated_chain() {
    let old = document("old", "old-refresh", 100);
    assert_eq!(
        updated_document(
            &old,
            200,
            |_| Ok(Some(document("new", "new-refresh", 300))),
            |_| panic!("old account cannot be verified"),
        )
        .unwrap_err(),
        LINK_REQUIRED
    );
}

#[test]
fn usagebar_owned_chain_cannot_enter_the_import_sync() {
    let mut old = document("old", "old-refresh", 100);
    old["usagebarCredentialOwner"] = Value::String("usagebar".into());
    assert!(
        updated_document(
            &old,
            200,
            |_| panic!("source read"),
            |_| panic!("profile verification")
        )
        .is_err()
    );
}

#[cfg(target_os = "windows")]
#[test]
fn sync_updates_only_the_captured_profile_and_cannot_restore_a_concurrent_delete() {
    let dir = std::env::temp_dir().join(format!("usagebar-claude-sync-{}", uuid::Uuid::new_v4()));
    let key = "account:sync-test:authJson";
    let other = "account:other:authJson";
    let original = linked(100).to_string();
    crate::protected_store::save(&dir, "claude", key, &original).unwrap();
    crate::protected_store::save(&dir, "claude", other, &original).unwrap();
    let update = || Ok(Some(document("new", "new-refresh", 300)));
    let actual = sync_with(
        &dir,
        key,
        200,
        |_| update(),
        |_| Ok(Some(profile("a", "org"))),
    )
    .unwrap()
    .unwrap();
    let read =
        |key| crate::protected_store::transaction(&dir, |store| store.read("claude", key)).unwrap();
    assert_eq!(read(key).as_deref(), Some(actual.as_str()));
    assert_eq!(read(other).as_deref(), Some(original.as_str()));

    crate::protected_store::save(&dir, "claude", key, &original).unwrap();
    let error = sync_with(
        &dir,
        key,
        200,
        |_| update(),
        |_| {
            crate::protected_store::delete(&dir, "claude", key).unwrap();
            Ok(Some(profile("a", "org")))
        },
    )
    .unwrap_err();
    assert!(error.contains("changed"));
    assert!(read(key).is_none());
    assert_eq!(read(other).as_deref(), Some(original.as_str()));
}
