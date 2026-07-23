use keyring::Entry;

const PROVIDER_SECRET_KEYRING_TARGET: &str = "OpenUsage";
#[cfg(target_os = "windows")]
const PROVIDER_SECRET_WINDOWS_USER: &str = "provider-secret";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct ProviderSecretEntrySpec<'a> {
    pub(super) target: Option<&'a str>,
    pub(super) service: &'a str,
    pub(super) user: &'a str,
}

pub(super) fn provider_secret_service(provider_id: &str, secret_key: &str) -> String {
    format!("OpenUsage Provider Secret {} {}", provider_id, secret_key)
}

pub(super) fn provider_secret_entry_spec(service: &str) -> ProviderSecretEntrySpec<'_> {
    #[cfg(target_os = "windows")]
    {
        ProviderSecretEntrySpec {
            target: Some(service),
            service: PROVIDER_SECRET_KEYRING_TARGET,
            user: PROVIDER_SECRET_WINDOWS_USER,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        ProviderSecretEntrySpec {
            target: None,
            service: PROVIDER_SECRET_KEYRING_TARGET,
            user: service,
        }
    }
}

#[cfg(target_os = "windows")]
fn provider_secret_legacy_entry_spec(service: &str) -> ProviderSecretEntrySpec<'_> {
    ProviderSecretEntrySpec {
        target: None,
        service: PROVIDER_SECRET_KEYRING_TARGET,
        user: service,
    }
}

fn open_provider_secret_entry(spec: ProviderSecretEntrySpec<'_>) -> Result<Entry, keyring::Error> {
    match spec.target {
        Some(target) => Entry::new_with_target(target, spec.service, spec.user),
        None => Entry::new(spec.service, spec.user),
    }
}

fn provider_display_name(provider_id: &str) -> String {
    match provider_id {
        "ollama" => "Ollama".to_string(),
        "opencode" => "OpenCode".to_string(),
        "codex" => "Codex".to_string(),
        "claude" => "Claude".to_string(),
        _ => provider_id.to_string(),
    }
}

fn provider_secret_field_label(secret_key: &str) -> &'static str {
    match secret_key {
        "cookieHeader" => "cookie header",
        _ => "secret",
    }
}

pub(super) fn provider_secret_label(provider_id: &str, secret_key: &str) -> String {
    format!(
        "{} {}",
        provider_display_name(provider_id),
        provider_secret_field_label(secret_key)
    )
}

pub(super) fn provider_secret_legacy_services(provider_id: &str, secret_key: &str) -> Vec<String> {
    match (provider_id, secret_key) {
        ("opencode", "cookieHeader") => vec!["OpenCode Cookie Header".to_string()],
        _ => Vec::new(),
    }
}

pub(super) fn delete_provider_secret_service(service: &str) -> Result<(), String> {
    let mut specs = vec![provider_secret_entry_spec(service)];
    #[cfg(target_os = "windows")]
    {
        specs.push(provider_secret_legacy_entry_spec(service));
    }

    for spec in specs {
        let entry = open_provider_secret_entry(spec)
            .map_err(|error| format!("credential store unavailable: {}", error))?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(error) => {
                let message = error.to_string().to_lowercase();
                if is_missing_credential_error(&message) {
                    continue;
                }
                return Err(format!("credential delete failed: {}", error));
            }
        }
    }

    Ok(())
}

pub(super) fn is_missing_credential_error(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("no entry")
        || normalized.contains("no matching entry found")
        || normalized.contains("not found")
        || normalized.contains("cannot find")
        || normalized.contains("element not found")
        || normalized.contains("credential not found")
        || normalized.contains("specified file could not be found")
        || normalized.contains("system cannot find the file specified")
        || normalized.contains("os error 1168")
}

#[cfg(not(target_os = "windows"))]
pub(super) fn read_provider_secret_service(
    provider_id: &str,
    secret_key: &str,
    service: &str,
) -> Result<String, String> {
    let label = provider_secret_label(provider_id, secret_key);
    let entry =
        open_provider_secret_entry(provider_secret_entry_spec(service)).map_err(|error| {
            format!(
                "Could not access the system credential vault for {}: {}",
                label, error
            )
        })?;
    entry.get_password().map_err(|error| {
        format!(
            "Saved {}, but could not read it back from a fresh system credential vault lookup: {}",
            label, error
        )
    })
}

pub(super) fn verify_provider_secret_write_with_fresh_lookup<F>(
    provider_id: &str,
    secret_key: &str,
    service: &str,
    expected_value: &str,
    read_secret: F,
) -> Result<(), String>
where
    F: FnOnce(&str) -> Result<String, String>,
{
    let label = provider_secret_label(provider_id, secret_key);
    let read_back = read_secret(service)?;
    if read_back != expected_value {
        return Err(format!(
            "Saved {}, but the fresh system credential vault lookup returned a different value.",
            label
        ));
    }
    Ok(())
}
