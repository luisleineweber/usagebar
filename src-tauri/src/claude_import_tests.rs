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
        assert!(error.user_message().contains("different account"));
    }
}

#[test]
fn legacy_import_can_link_on_an_exact_access_token_match() {
    let old = document("old", "old-refresh", 300);
    let updated = updated_document(
        &old,
        200,
        |source| Ok((source == Source::File).then(|| document("old", "new-refresh", 300))),
        |access| {
            assert_eq!(access, "old");
            Ok(Some(profile("a", "org")))
        },
    )
    .unwrap()
    .unwrap();
    assert!(updated.contains(LINK));
}

#[test]
fn expired_legacy_import_cannot_relink_with_only_a_matching_refresh_token() {
    let old = document("old", "old-refresh", 100);
    assert_eq!(
        updated_document(
            &old,
            200,
            |_| Ok(Some(document("new", "old-refresh", 300))),
            |_| panic!("old account cannot be verified"),
        )
        .unwrap_err()
        .user_message(),
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
    assert!(error.user_message().contains("changed"));
    assert!(read(key).is_none());
    assert_eq!(read(other).as_deref(), Some(original.as_str()));
}

#[test]
fn credential_projection_excludes_refresh_token_and_link() {
    let projection = public_credentials(&linked(100).to_string()).unwrap();
    assert_eq!(projection["claudeAiOauth"]["accessToken"], "old");
    assert_eq!(projection["claudeAiOauth"]["expiresAt"], 100);
    assert_eq!(projection["claudeAiOauth"]["hasRefreshToken"], false);
    assert!(projection.get(LINK).is_none());
    assert!(projection["claudeAiOauth"].get("refreshToken").is_none());
}

#[test]
fn retry_after_accepts_numbers_and_http_dates_only() {
    assert_eq!(retry_after_seconds("600"), Some(600));
    assert_eq!(
        retry_after_seconds("Wed, 21 Oct 2015 07:28:00 GMT"),
        Some(0)
    );
    assert_eq!(retry_after_seconds("synthetic-secret"), None);
}

#[cfg(target_os = "windows")]
#[test]
fn relink_requires_confirmation_and_preserves_the_selected_profile_id() {
    let dir = std::env::temp_dir().join(format!("usagebar-relink-test-{}", uuid::Uuid::new_v4()));
    let previous = document("old", "old-refresh", 100).to_string();
    let previous_profile = crate::provider_account_store::import_profile(
        &dir,
        "claude",
        crate::provider_account_store::ImportedProviderAccount {
            label: "Old".into(),
            email: None,
            account_id: Some("org".into()),
        },
        0,
    )
    .unwrap();
    let id = &previous_profile.profile_id;
    let key = format!("account:{id}:authJson");
    crate::protected_store::save(&dir, "claude", &key, &previous).unwrap();
    let resolve = || ResolvedClaudeAuth {
        email: Some("new@example.test".into()),
        account_id: "account:org".into(),
        auth_json: bind(
            document("new", "new-refresh", 300),
            Source::File,
            profile("account", "org").identity,
        )
        .unwrap(),
    };
    assert!(
        crate::provider_account_store::link_claude_profile(
            &dir,
            id,
            &previous,
            resolve(),
            false,
            1
        )
        .is_err()
    );
    assert_eq!(current_import(&dir, &key).unwrap(), previous);
    let updated =
        crate::provider_account_store::link_claude_profile(&dir, id, &previous, resolve(), true, 2)
            .unwrap();
    assert_eq!(updated.profile_id, *id);
    assert_eq!(updated.account_id.as_deref(), Some("account:org"));
    assert_eq!(
        crate::provider_account_store::list_profiles(&dir, "claude").unwrap(),
        [updated]
    );
    assert_eq!(current_import(&dir, &key).unwrap(), resolve().auth_json);
}

#[test]
fn user_confirmation_does_not_replace_an_established_account_with_a_different_identity() {
    let next = bind(
        document("new", "new-refresh", 300),
        Source::File,
        profile("other", "org").identity,
    )
    .unwrap();
    assert!(authorize_relink(&linked(100).to_string(), &next, true).is_err());
}
