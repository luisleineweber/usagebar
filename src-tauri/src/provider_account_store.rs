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
        store.save("claude", &key, &resolved.auth_json)?;
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
        save_accounts_file(data_dir, "claude", &file)?;
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
}
