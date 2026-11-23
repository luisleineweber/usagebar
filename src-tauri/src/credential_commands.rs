use tauri::Manager;

use crate::browser_cookie_import;
use crate::codex_account_store;
use crate::provider_account_store;
#[cfg(target_os = "windows")]
use crate::provider_secret_store;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportedCodexAccountResponse {
    pub profile: codex_account_store::CodexAccountProfile,
    pub was_first_profile: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportedProviderAccountResponse {
    pub profile: provider_account_store::ProviderAccountProfile,
    pub was_first_profile: bool,
}

fn validate_managed_provider_id(provider_id: &str) -> Result<String, String> {
    let provider_id = provider_id.trim().to_ascii_lowercase();
    if provider_id.is_empty()
        || provider_id
            .chars()
            .any(|character| !(character.is_ascii_alphanumeric() || character == '-'))
    {
        return Err("provider id is invalid".to_string());
    }
    Ok(provider_id)
}

fn managed_profile_secret_key(profile_id: &str) -> String {
    format!("account:{}:authJson", profile_id)
}

fn save_managed_profile_secret(
    app_data_dir: &std::path::Path,
    provider_id: &str,
    profile_id: &str,
    auth_json: &str,
) -> Result<(), String> {
    crate::protected_store::save(
        app_data_dir,
        provider_id,
        &managed_profile_secret_key(profile_id),
        auth_json,
    )
    .map_err(|error| {
        format!(
            "Could not save imported {} profile auth: {}",
            provider_id, error
        )
    })
}

#[tauri::command]
pub(crate) async fn list_browser_import_sources(
    app_handle: tauri::AppHandle,
    provider_id: String,
) -> Result<Vec<browser_cookie_import::BrowserImportSource>, String> {
    let provider_id = provider_id.trim().to_ascii_lowercase();
    if provider_id.is_empty() {
        return Err("provider id is required".to_string());
    }
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        browser_cookie_import::list_sources(&app_data_dir, &provider_id)
    })
    .await
    .map_err(|error| format!("Could not inspect browser import sources: {error}"))
}

#[tauri::command]
pub(crate) async fn import_browser_cookies(
    app_handle: tauri::AppHandle,
    provider_id: String,
    source_id: String,
    profile_id: String,
) -> Result<browser_cookie_import::BrowserCookieImportResult, String> {
    let provider_id = provider_id.trim().to_ascii_lowercase();
    let source_id = source_id.trim().to_ascii_lowercase();
    let profile_id = profile_id.trim().to_string();
    if provider_id.is_empty() || source_id.is_empty() || profile_id.is_empty() {
        return Err("provider id, browser source, and profile are required".to_string());
    }
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        browser_cookie_import::import_cookies(&app_data_dir, &provider_id, &source_id, &profile_id)
    })
    .await
    .map_err(|error| format!("Could not import browser cookies: {error}"))
}

#[tauri::command]
pub(crate) fn set_provider_secret(
    _app_handle: tauri::AppHandle,
    provider_id: String,
    secret_key: String,
    value: String,
) -> Result<(), String> {
    let trimmed_provider = provider_id.trim();
    let trimmed_secret = secret_key.trim();
    let trimmed_value = value.trim();

    if trimmed_provider.is_empty() || trimmed_secret.is_empty() {
        return Err("provider and secret key are required".to_string());
    }
    if trimmed_value.is_empty() {
        return Err("secret value cannot be empty".to_string());
    }

    let service = crate::provider_secret_service(trimmed_provider, trimmed_secret);
    let label = crate::provider_secret_label(trimmed_provider, trimmed_secret);
    #[cfg(target_os = "windows")]
    let app_data_dir = _app_handle.path().app_data_dir().map_err(|error| {
        format!(
            "Could not access the app data directory for {}: {}",
            label, error
        )
    })?;
    log::info!(
        "setting provider secret for provider='{}' key='{}'",
        trimmed_provider,
        trimmed_secret
    );

    #[cfg(target_os = "windows")]
    {
        provider_secret_store::save_provider_secret(
            &app_data_dir,
            trimmed_provider,
            trimmed_secret,
            trimmed_value,
        )
        .map_err(|error| {
            format!(
                "Could not save {} to the Windows-protected local secret store: {}",
                label, error
            )
        })?;

        crate::verify_provider_secret_write_with_fresh_lookup(
            trimmed_provider,
            trimmed_secret,
            &service,
            trimmed_value,
            |_| {
                provider_secret_store::read_provider_secret(
                    &app_data_dir,
                    trimmed_provider,
                    trimmed_secret,
                )?
                .ok_or_else(|| {
                    format!(
                        "Saved {}, but it was missing from the Windows-protected local secret store on the next read.",
                        label
                    )
                })
            },
        )?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let entry = crate::open_provider_secret_entry(crate::provider_secret_entry_spec(&service))
            .map_err(|error| {
                format!(
                    "Could not access the system credential vault for {}: {}",
                    label, error
                )
            })?;

        let _vault_lock = crate::protected_store::lock(std::path::Path::new(""))?;

        entry.set_password(trimmed_value).map_err(|error| {
            format!(
                "Could not save {} to the system credential vault: {}",
                label, error
            )
        })?;

        return crate::verify_provider_secret_write_with_fresh_lookup(
            trimmed_provider,
            trimmed_secret,
            &service,
            trimmed_value,
            |service| {
                crate::read_provider_secret_service(trimmed_provider, trimmed_secret, service)
            },
        );
    }

    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_provider_secret(
    _app_handle: tauri::AppHandle,
    provider_id: String,
    secret_key: String,
) -> Result<(), String> {
    let trimmed_provider = provider_id.trim();
    let trimmed_secret = secret_key.trim();

    if trimmed_provider.is_empty() || trimmed_secret.is_empty() {
        return Err("provider and secret key are required".to_string());
    }

    log::info!(
        "deleting provider secret for provider='{}' key='{}'",
        trimmed_provider,
        trimmed_secret
    );

    #[cfg(target_os = "windows")]
    {
        let app_data_dir = _app_handle.path().app_data_dir().map_err(|error| {
            format!(
                "Could not access the app data directory while removing {}: {}",
                crate::provider_secret_label(trimmed_provider, trimmed_secret),
                error
            )
        })?;

        provider_secret_store::delete_provider_secret(
            &app_data_dir,
            trimmed_provider,
            trimmed_secret,
        )
        .map_err(|error| {
            format!(
                "Could not remove {} from the Windows-protected local secret store: {}",
                crate::provider_secret_label(trimmed_provider, trimmed_secret),
                error
            )
        })?;
    }

    let mut services = vec![crate::provider_secret_service(
        trimmed_provider,
        trimmed_secret,
    )];
    services.extend(crate::provider_secret_legacy_services(
        trimmed_provider,
        trimmed_secret,
    ));

    for service in services {
        if let Err(error) = crate::delete_provider_secret_service(&service) {
            log::error!(
                "provider secret delete failed for provider='{}' key='{}' service='{}': {}",
                trimmed_provider,
                trimmed_secret,
                service,
                error
            );
            return Err(error);
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn list_codex_account_profiles(
    app_handle: tauri::AppHandle,
) -> Result<Vec<codex_account_store::CodexAccountProfile>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    codex_account_store::list_profiles(&app_data_dir)
}

#[tauri::command]
pub(crate) fn import_current_codex_account_profile(
    app_handle: tauri::AppHandle,
) -> Result<ImportedCodexAccountResponse, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    let existing_profiles = codex_account_store::list_profiles(&app_data_dir)?;
    let resolved = crate::resolve_current_codex_auth()?;
    let now_ms = crate::now_utc_unix_ms();
    let imported = codex_account_store::ImportedCodexAccount {
        label: crate::codex_profile_label(
            resolved.email.as_deref(),
            resolved.account_id.as_deref(),
            now_ms,
        ),
        email: resolved.email.clone(),
        account_id: resolved.account_id.clone(),
    };
    let profile = codex_account_store::import_profile(&app_data_dir, imported, now_ms)?;
    let secret_key = format!("account:{}:authJson", profile.profile_id);

    #[cfg(target_os = "windows")]
    provider_secret_store::save_provider_secret(
        &app_data_dir,
        "codex",
        &secret_key,
        &resolved.auth_json,
    )
    .map_err(|error| format!("Could not save imported Codex profile auth: {}", error))?;

    #[cfg(not(target_os = "windows"))]
    {
        let service = crate::provider_secret_service("codex", &secret_key);
        let entry = crate::open_provider_secret_entry(crate::provider_secret_entry_spec(&service))
            .map_err(|error| format!("Could not access the system credential vault: {}", error))?;
        let _vault_lock = crate::protected_store::lock(std::path::Path::new(""))?;
        entry
            .set_password(&resolved.auth_json)
            .map_err(|error| format!("Could not save imported Codex profile auth: {}", error))?;
    }

    Ok(ImportedCodexAccountResponse {
        profile,
        was_first_profile: existing_profiles.is_empty(),
    })
}

#[tauri::command]
pub(crate) fn delete_codex_account_profile(
    app_handle: tauri::AppHandle,
    profile_id: String,
) -> Result<Option<codex_account_store::CodexAccountProfile>, String> {
    let trimmed_profile_id = profile_id.trim();
    if trimmed_profile_id.is_empty() {
        return Err("profile id is required".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    let removed = codex_account_store::delete_profile(&app_data_dir, trimmed_profile_id)?;
    if removed.is_none() {
        return Ok(None);
    }

    let secret_key = format!("account:{}:authJson", trimmed_profile_id);
    #[cfg(target_os = "windows")]
    provider_secret_store::delete_provider_secret(&app_data_dir, "codex", &secret_key)
        .map_err(|error| format!("Could not remove imported Codex profile auth: {}", error))?;

    let service = crate::provider_secret_service("codex", &secret_key);
    crate::delete_provider_secret_service(&service)
        .map_err(|error| format!("Could not remove imported Codex profile auth: {}", error))?;

    if let Some(selected_profile_id) =
        crate::read_provider_config_string(&app_data_dir, "codex", "selectedAccountProfileId")?
    {
        if selected_profile_id.trim() == trimmed_profile_id {
            log::info!(
                "deleted selected Codex profile '{}'; UI should clear selectedAccountProfileId on next settings load",
                trimmed_profile_id
            );
        }
    }

    Ok(removed)
}

#[tauri::command]
pub(crate) fn list_provider_account_profiles(
    app_handle: tauri::AppHandle,
    provider_id: String,
) -> Result<Vec<provider_account_store::ProviderAccountProfile>, String> {
    let provider_id = validate_managed_provider_id(&provider_id)?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    provider_account_store::list_profiles(&app_data_dir, &provider_id)
}

#[tauri::command]
pub(crate) async fn import_current_provider_account_profile(
    app_handle: tauri::AppHandle,
    provider_id: String,
) -> Result<ImportedProviderAccountResponse, String> {
    let provider_id = validate_managed_provider_id(&provider_id)?;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    let now_ms = crate::now_utc_unix_ms();
    let provider = provider_id.clone();
    let (imported, auth_json) = tauri::async_runtime::spawn_blocking(move || {
        resolve_provider_account_import(&provider, now_ms)
    })
    .await
    .map_err(|_| "Could not complete the account import".to_string())??;

    // Keep metadata changes serialized with the synchronous profile deletion command.
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    app_handle
        .run_on_main_thread(move || {
            let result = (|| {
                let was_first_profile =
                    provider_account_store::list_profiles(&app_data_dir, &provider_id)?.is_empty();
                let profile = provider_account_store::import_profile(
                    &app_data_dir,
                    &provider_id,
                    imported,
                    now_ms,
                )?;
                save_managed_profile_secret(
                    &app_data_dir,
                    &provider_id,
                    &profile.profile_id,
                    &auth_json,
                )?;
                Ok(ImportedProviderAccountResponse {
                    profile,
                    was_first_profile,
                })
            })();
            let _ = sender.try_send(result);
        })
        .map_err(|_| "Could not save the imported account".to_string())?;
    receiver
        .recv()
        .await
        .ok_or_else(|| "Could not complete the account import".to_string())?
}

fn resolve_provider_account_import(
    provider_id: &str,
    now_ms: i64,
) -> Result<(provider_account_store::ImportedProviderAccount, String), String> {
    let (label, email, account_id, auth_json) = match provider_id {
        "claude" => {
            let resolved = crate::claude_import::resolve_current_claude_auth()?;
            (
                crate::claude_profile_label(
                    resolved.email.as_deref(),
                    Some(&resolved.account_id),
                    now_ms,
                ),
                resolved.email,
                Some(resolved.account_id),
                resolved.auth_json,
            )
        }
        "codex" => {
            let resolved = crate::resolve_current_codex_auth()?;
            (
                crate::codex_profile_label(
                    resolved.email.as_deref(),
                    resolved.account_id.as_deref(),
                    now_ms,
                ),
                resolved.email,
                resolved.account_id,
                resolved.auth_json,
            )
        }
        "gemini" => {
            let resolved = crate::resolve_current_gemini_auth()?;
            (
                crate::gemini_profile_label(
                    resolved.email.as_deref(),
                    resolved.account_id.as_deref(),
                    now_ms,
                ),
                resolved.email,
                resolved.account_id,
                resolved.auth_json,
            )
        }
        _ => {
            return Err(format!(
                "Managed account import is not supported for {} yet",
                provider_id
            ));
        }
    };

    Ok((
        provider_account_store::ImportedProviderAccount {
            label,
            email,
            account_id,
        },
        auth_json,
    ))
}

#[tauri::command]
pub(crate) fn delete_provider_account_profile(
    app_handle: tauri::AppHandle,
    provider_id: String,
    profile_id: String,
) -> Result<Option<provider_account_store::ProviderAccountProfile>, String> {
    let provider_id = validate_managed_provider_id(&provider_id)?;
    let profile_id = profile_id.trim();
    if profile_id.is_empty() {
        return Err("profile id is required".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access the app data directory: {}", error))?;
    provider_account_store::delete_profile_with_credentials(&app_data_dir, &provider_id, profile_id)
}
