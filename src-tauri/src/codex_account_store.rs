use crate::provider_account_store;

pub use provider_account_store::ProviderAccountProfile as CodexAccountProfile;

#[derive(Debug, Clone)]
pub struct ImportedCodexAccount {
    pub label: String,
    pub email: Option<String>,
    pub account_id: Option<String>,
}

pub fn list_profiles(app_data_dir: &std::path::Path) -> Result<Vec<CodexAccountProfile>, String> {
    provider_account_store::list_profiles(app_data_dir, "codex")
}

pub fn import_profile(
    app_data_dir: &std::path::Path,
    imported: ImportedCodexAccount,
    now_ms: i64,
) -> Result<CodexAccountProfile, String> {
    provider_account_store::import_profile(
        app_data_dir,
        "codex",
        provider_account_store::ImportedProviderAccount {
            label: imported.label,
            email: imported.email,
            account_id: imported.account_id,
        },
        now_ms,
    )
}

pub fn delete_profile(
    app_data_dir: &std::path::Path,
    profile_id: &str,
) -> Result<Option<CodexAccountProfile>, String> {
    provider_account_store::delete_profile(app_data_dir, "codex", profile_id)
}
