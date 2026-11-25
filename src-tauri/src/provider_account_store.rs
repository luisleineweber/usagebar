use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountProfile {
    pub profile_id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    pub source_kind: String,
    pub last_imported_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validated_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderAccountsFile {
    profiles: Vec<ProviderAccountProfile>,
}

#[derive(Debug, Clone)]
pub struct ImportedProviderAccount {
    pub label: String,
    pub email: Option<String>,
    pub account_id: Option<String>,
}

fn accounts_dir(app_data_dir: &Path, provider_id: &str) -> PathBuf {
    app_data_dir.join("plugins_data").join(provider_id)
}

fn accounts_file_path(app_data_dir: &Path, provider_id: &str) -> PathBuf {
    accounts_dir(app_data_dir, provider_id).join("accounts.json")
}

fn load_accounts_file(
    app_data_dir: &Path,
    provider_id: &str,
) -> Result<ProviderAccountsFile, String> {
    let path = accounts_file_path(app_data_dir, provider_id);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|error| {
            format!(
                "Could not parse {} account registry: {}",
                provider_id, error
            )
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ProviderAccountsFile::default())
        }
        Err(error) => Err(format!(
            "Could not read {} account registry: {}",
            provider_id, error
        )),
    }
}

fn save_accounts_file(
    app_data_dir: &Path,
    provider_id: &str,
    file: &ProviderAccountsFile,
) -> Result<(), String> {
    let dir = accounts_dir(app_data_dir, provider_id);
    std::fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "Could not create {} account registry directory: {}",
            provider_id, error
        )
    })?;

    let path = accounts_file_path(app_data_dir, provider_id);
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(file).map_err(|error| {
        format!(
            "Could not encode {} account registry: {}",
            provider_id, error
        )
    })?;
    std::fs::write(&temp_path, json).map_err(|error| {
        format!(
            "Could not write {} account registry: {}",
            provider_id, error
        )
    })?;
    std::fs::rename(&temp_path, &path).map_err(|error| {
        format!(
            "Could not finalize {} account registry: {}",
            provider_id, error
        )
    })?;
    Ok(())
}

pub fn list_profiles(
    app_data_dir: &Path,
    provider_id: &str,
) -> Result<Vec<ProviderAccountProfile>, String> {
    let mut file = load_accounts_file(app_data_dir, provider_id)?;
    file.profiles
        .sort_by_key(|profile| std::cmp::Reverse(profile.last_imported_at));
    Ok(file.profiles)
}

pub fn import_profile(
    app_data_dir: &Path,
    provider_id: &str,
    imported: ImportedProviderAccount,
    now_ms: i64,
) -> Result<ProviderAccountProfile, String> {
    let mut file = load_accounts_file(app_data_dir, provider_id)?;
    if let Some(existing_index) = file.profiles.iter().position(|profile| {
        profile.email == imported.email && profile.account_id == imported.account_id
    }) {
        let existing = &mut file.profiles[existing_index];
        existing.label = imported.label;
        existing.email = imported.email;
        existing.account_id = imported.account_id;
        existing.source_kind = "detected-cli".to_string();
        existing.last_imported_at = now_ms;
        existing.last_error = None;
        let saved = existing.clone();
        save_accounts_file(app_data_dir, provider_id, &file)?;
        return Ok(saved);
    }

    if provider_id == "claude" {
        check_claude_legacy_import(app_data_dir, &file.profiles, &imported)?;
    }

    let profile = ProviderAccountProfile {
        profile_id: Uuid::new_v4().to_string(),
        label: imported.label,
        email: imported.email,
        account_id: imported.account_id,
        source_kind: "detected-cli".to_string(),
        last_imported_at: now_ms,
        last_validated_at: None,
        last_error: None,
    };
    file.profiles.push(profile.clone());
    save_accounts_file(app_data_dir, provider_id, &file)?;
    Ok(profile)
}

fn check_claude_legacy_import(
    data_dir: &Path,
    profiles: &[ProviderAccountProfile],
    imported: &ImportedProviderAccount,
) -> Result<(), String> {
    let Some((_, org_id)) = imported
        .account_id
        .as_deref()
        .and_then(|id| id.split_once(':'))
    else {
        return Ok(());
    };
    let mut legacy = profiles
        .iter()
        .filter(|profile| {
            profile
                .account_id
                .as_deref()
                .is_none_or(|id| !id.contains(':'))
        })
        .peekable();
    if legacy.peek().is_none() {
        return Ok(());
    }

    let candidate = if let Some(profile) = legacy.clone().find(|profile| {
        profile.account_id.as_deref() == Some(org_id)
            || profile
                .email
                .as_deref()
                .zip(imported.email.as_deref())
                .is_some_and(|(saved, current)| saved.eq_ignore_ascii_case(current))
    }) {
        Some(profile)
    } else {
        crate::read_provider_config_string(data_dir, "claude", "selectedAccountProfileId")?
            .and_then(|selected| legacy.find(|profile| profile.profile_id == selected))
    };
    if let Some(profile) = candidate {
        return Err(format!(
            "In Settings, select Link current Claude Code login for the older profile \"{}\".",
            profile.label
        ));
    }
    Ok(())
}

/// Update the existing profile and its credential in one serialized operation.
pub(crate) fn link_claude_profile(
    data_dir: &Path,
    profile_id: &str,
    previous: &str,
    resolved: crate::claude_import::ResolvedClaudeAuth,
    confirmed: bool,
    now_ms: i64,
) -> Result<ProviderAccountProfile, String> {
    crate::claude_import::authorize_relink(previous, &resolved.auth_json, confirmed)?;
    crate::protected_store::transaction(data_dir, |store| {
        let mut file = load_accounts_file(data_dir, "claude")?;
        let profile = file
            .profiles
            .iter_mut()
            .find(|p| p.profile_id == profile_id)
            .ok_or("The selected Claude profile was removed.")?;
        let key = format!("account:{profile_id}:authJson");
        if store.read("claude", &key)?.as_deref() != Some(previous) {
            return Err("The selected Claude import changed. Try again.".into());
        }
        profile.label = crate::claude_profile_label(
            resolved.email.as_deref(),
            Some(&resolved.account_id),
            now_ms,
        );
        profile.email = resolved.email;
        profile.account_id = Some(resolved.account_id);
        profile.last_imported_at = now_ms;
        profile.last_error = None;
        let updated = profile.clone();
        let result = store
            .save("claude", &key, &resolved.auth_json)
            .and_then(|()| save_accounts_file(data_dir, "claude", &file));
        if let Err(error) = result {
            // A credential save can report an error after writing, during recovery cleanup.
            let restore = store.read("claude", &key).and_then(|current| {
                if current.as_deref() != Some(previous) {
                    store.save("claude", &key, previous)?;
                }
                Ok(())
            });
            return Err(match restore {
                Ok(()) => error,
                Err(restore_error) => format!(
                    "{error}. Could not confirm restoration of the previous Claude Code sign-in. {restore_error}"
                ),
            });
        }
        Ok(updated)
    })
}

pub fn delete_profile(
    app_data_dir: &Path,
    provider_id: &str,
    profile_id: &str,
) -> Result<Option<ProviderAccountProfile>, String> {
    let mut file = load_accounts_file(app_data_dir, provider_id)?;
    let index = match file
        .profiles
        .iter()
        .position(|profile| profile.profile_id == profile_id)
    {
        Some(index) => index,
        None => return Ok(None),
    };
    let removed = file.profiles.remove(index);
    save_accounts_file(app_data_dir, provider_id, &file)?;
    Ok(Some(removed))
}

/// Shared by the Tauri delete command and native regression tests.
pub(crate) fn delete_profile_with_credentials(
    app_data_dir: &Path,
    provider_id: &str,
    profile_id: &str,
) -> Result<Option<ProviderAccountProfile>, String> {
    if !list_profiles(app_data_dir, provider_id)?
        .iter()
        .any(|profile| profile.profile_id == profile_id)
    {
        return Ok(None);
    }
    // Keep the profile selectable for retry until credential removal succeeds.
    let secret_key = format!("account:{}:authJson", profile_id);
    crate::protected_store::delete(app_data_dir, provider_id, &secret_key).map_err(|error| {
        format!(
            "Could not remove imported {} profile auth: {}",
            provider_id, error
        )
    })?;
    #[cfg(target_os = "windows")]
    {
        let service = crate::provider_secret_service(provider_id, &secret_key);
        crate::delete_provider_secret_service(&service)?;
    }
    delete_profile(app_data_dir, provider_id, profile_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("usagebar-provider-accounts-{}", Uuid::new_v4()))
    }

    #[test]
    fn profiles_are_scoped_to_the_provider() {
        let dir = temp_dir();
        let imported = ImportedProviderAccount {
            label: "Claude work".to_string(),
            email: Some("work@example.com".to_string()),
            account_id: Some("org-work".to_string()),
        };
        let profile = import_profile(&dir, "claude", imported, 1).expect("profile");

        assert_eq!(list_profiles(&dir, "claude").unwrap(), vec![profile]);
        assert!(list_profiles(&dir, "codex").unwrap().is_empty());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn importing_the_same_identity_keeps_the_profile_id() {
        let dir = temp_dir();
        let first = import_profile(
            &dir,
            "claude",
            ImportedProviderAccount {
                label: "Claude work".to_string(),
                email: Some("work@example.com".to_string()),
                account_id: Some("org-work".to_string()),
            },
            1,
        )
        .expect("first profile");
        let second = import_profile(
            &dir,
            "claude",
            ImportedProviderAccount {
                label: "Updated Claude work".to_string(),
                email: Some("work@example.com".to_string()),
                account_id: Some("org-work".to_string()),
            },
            2,
        )
        .expect("updated profile");

        assert_eq!(second.profile_id, first.profile_id);
        assert_eq!(second.label, "Updated Claude work");
        assert_eq!(list_profiles(&dir, "claude").unwrap(), vec![second]);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn importing_verified_claude_login_points_to_the_matching_legacy_profile() {
        for (email, account_id, selected) in [
            (None, Some("org"), false),
            (Some("WORK@example.test"), Some("old-org"), false),
            (None, None, true),
        ] {
            let dir = temp_dir();
            let previous = import_profile(
                &dir,
                "claude",
                ImportedProviderAccount {
                    label: "Old Work".into(),
                    email: email.map(str::to_owned),
                    account_id: account_id.map(str::to_owned),
                },
                1,
            )
            .unwrap();
            if selected {
                let settings = serde_json::json!({
                    "providerConfigs": { "claude": { "selectedAccountProfileId": previous.profile_id } }
                });
                std::fs::write(dir.join("settings.json"), settings.to_string()).unwrap();
            }

            let result = import_profile(
                &dir,
                "claude",
                ImportedProviderAccount {
                    label: "Verified Work".into(),
                    email: Some("work@example.test".into()),
                    account_id: Some("account:org".into()),
                },
                2,
            );
            let profiles = list_profiles(&dir, "claude").unwrap();
            let _ = std::fs::remove_dir_all(&dir);
            let error = result.expect_err("a legacy profile must be linked in place");
            assert!(error.contains("Link current Claude Code login"));
            assert!(error.contains(&previous.label));
            assert_eq!(profiles, [previous]);
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn relink_registry_write_failure_preserves_the_previous_claude_credentials() {
        let dir = temp_dir();
        let previous_profile = import_profile(
            &dir,
            "claude",
            ImportedProviderAccount {
                label: "Old Work".into(),
                email: None,
                account_id: Some("org".into()),
            },
            1,
        )
        .unwrap();
        let previous = r#"{"claudeAiOauth":{"accessToken":"old-fixture"}}"#;
        let key = format!("account:{}:authJson", previous_profile.profile_id);
        crate::protected_store::save(&dir, "claude", &key, previous).unwrap();
        std::fs::create_dir(accounts_file_path(&dir, "claude").with_extension("json.tmp")).unwrap();

        let error = link_claude_profile(
            &dir,
            &previous_profile.profile_id,
            previous,
            crate::claude_import::ResolvedClaudeAuth {
                email: Some("work@example.test".into()),
                account_id: "account:org".into(),
                auth_json: r#"{"claudeAiOauth":{"accessToken":"new-fixture"}}"#.into(),
            },
            true,
            2,
        )
        .unwrap_err();
        let credentials = crate::claude_import::current_import(&dir, &key).unwrap();
        let profiles = list_profiles(&dir, "claude").unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(error.contains("Could not write claude account registry"));
        assert_eq!(credentials, previous);
        assert_eq!(profiles, [previous_profile]);
    }
}
