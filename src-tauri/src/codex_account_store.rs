use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountProfile {
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
struct CodexAccountsFile {
    profiles: Vec<CodexAccountProfile>,
}

#[derive(Debug, Clone)]
pub struct ImportedCodexAccount {
    pub label: String,
    pub email: Option<String>,
    pub account_id: Option<String>,
}

fn codex_accounts_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("plugins_data").join("codex")
}

fn codex_accounts_file_path(app_data_dir: &Path) -> PathBuf {
    codex_accounts_dir(app_data_dir).join("accounts.json")
}

fn load_accounts_file(app_data_dir: &Path) -> Result<CodexAccountsFile, String> {
    let path = codex_accounts_file_path(app_data_dir);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|error| format!("Could not parse Codex account registry: {}", error)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(CodexAccountsFile::default()),
        Err(error) => Err(format!("Could not read Codex account registry: {}", error)),
    }
}

fn save_accounts_file(app_data_dir: &Path, file: &CodexAccountsFile) -> Result<(), String> {
    let dir = codex_accounts_dir(app_data_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create Codex account registry directory: {}", error))?;

    let path = codex_accounts_file_path(app_data_dir);
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_vec_pretty(file)
        .map_err(|error| format!("Could not encode Codex account registry: {}", error))?;
    std::fs::write(&temp_path, json)
        .map_err(|error| format!("Could not write Codex account registry: {}", error))?;
    std::fs::rename(&temp_path, &path)
        .map_err(|error| format!("Could not finalize Codex account registry: {}", error))?;
    Ok(())
}

pub fn list_profiles(app_data_dir: &Path) -> Result<Vec<CodexAccountProfile>, String> {
    let mut file = load_accounts_file(app_data_dir)?;
    file.profiles
        .sort_by(|left, right| right.last_imported_at.cmp(&left.last_imported_at));
    Ok(file.profiles)
}

pub fn import_profile(
    app_data_dir: &Path,
    imported: ImportedCodexAccount,
    now_ms: i64,
) -> Result<CodexAccountProfile, String> {
    let mut file = load_accounts_file(app_data_dir)?;
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
        save_accounts_file(app_data_dir, &file)?;
        return Ok(saved);
    }

    let profile = CodexAccountProfile {
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
    save_accounts_file(app_data_dir, &file)?;
    Ok(profile)
}

pub fn delete_profile(app_data_dir: &Path, profile_id: &str) -> Result<Option<CodexAccountProfile>, String> {
    let mut file = load_accounts_file(app_data_dir)?;
    let index = match file.profiles.iter().position(|profile| profile.profile_id == profile_id) {
        Some(index) => index,
        None => return Ok(None),
    };
    let removed = file.profiles.remove(index);
    save_accounts_file(app_data_dir, &file)?;
    Ok(Some(removed))
}
