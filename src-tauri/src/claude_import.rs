//! Bind imported credentials to the same Claude Code source and verified account.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

const PROFILE_URL: &str = "https://api.anthropic.com/api/oauth/profile";
const LINK: &str = "usagebarClaudeSource";
const RUN_CLAUDE: &str = "Run Claude Code once, then try again.";
const LINK_REQUIRED: &str = "Could not match this older Claude import to the current sign-in. Run Claude Code and link this account again in Settings.";

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Source {
    Keychain,
    File,
}

const SOURCES: [Source; 2] = [Source::Keychain, Source::File];

#[derive(PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    account_id: String,
    organization_id: String,
}

#[derive(Serialize, Deserialize)]
struct Link {
    source: Source,
    identity: Identity,
}

struct Profile {
    identity: Identity,
    email: Option<String>,
}

pub(crate) struct ResolvedClaudeAuth {
    pub(crate) auth_json: String,
    pub(crate) email: Option<String>,
    pub(crate) account_id: String,
}

fn nonempty(value: &Value) -> Option<&str> {
    value.as_str().map(str::trim).filter(|s| !s.is_empty())
}

fn token<'a>(document: &'a Value, name: &str) -> Option<&'a str> {
    nonempty(&document["claudeAiOauth"][name])
}

fn expiry(document: &Value) -> Option<f64> {
    let value = &document["claudeAiOauth"]["expiresAt"];
    value
        .as_f64()
        .or_else(|| value.as_str()?.trim().parse().ok())
        .filter(|n| n.is_finite())
}

fn valid_access(document: &Value, now: i64) -> Option<&str> {
    token(document, "accessToken").filter(|_| expiry(document).is_some_and(|at| at > now as f64))
}

fn read_source(source: Source) -> Result<Option<Value>, String> {
    let raw = match source {
        Source::Keychain => read_keychain()?,
        Source::File => {
            let path = dirs::home_dir()
                .ok_or("Could not locate the Claude Code credentials file")?
                .join(".claude")
                .join(".credentials.json");
            match std::fs::read_to_string(path) {
                Ok(raw) => Some(raw),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(_) => return Err("Could not read the Claude Code credentials file".into()),
            }
        }
    };
    Ok(raw.and_then(|raw| crate::credential_support::json_string_or_object(&raw)))
}

#[cfg(target_os = "windows")]
fn read_keychain() -> Result<Option<String>, String> {
    // This is the native target of the legacy Entry::new("OpenUsage", "Claude Code-credentials").
    match crate::plugin_engine::env::read_windows_generic_password_target(
        "Claude Code-credentials.OpenUsage",
    ) {
        Ok(raw) => Ok(Some(raw)),
        Err(error) if error.ends_with("os error 1168") => Ok(None),
        Err(_) => {
            Err("Could not read Claude Code credentials from Windows Credential Manager".into())
        }
    }
}

#[cfg(target_os = "macos")]
fn read_keychain() -> Result<Option<String>, String> {
    let output = std::process::Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-w",
        ])
        .output()
        .map_err(|_| "Could not read Claude Code credentials from Keychain")?;
    if output.status.success() {
        return String::from_utf8(output.stdout)
            .map(Some)
            .map_err(|_| "Could not decode Claude Code credentials from Keychain".into());
    }
    if output.status.code() == Some(44) {
        return Ok(None);
    }
    Err("Could not read Claude Code credentials from Keychain".into())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn read_keychain() -> Result<Option<String>, String> {
    Ok(None)
}

fn parse_profile(value: &Value) -> Option<Profile> {
    let account = &value["account"];
    Some(Profile {
        identity: Identity {
            account_id: nonempty(&account["uuid"])?.to_owned(),
            organization_id: nonempty(&value["organization"]["uuid"])?.to_owned(),
        },
        email: nonempty(&account["email"])
            .or_else(|| nonempty(&account["email_address"]))
            .map(str::to_owned),
    })
}

fn read_profile(access: &str) -> Result<Option<Profile>, String> {
    let response = crate::plugin_engine::host_api::claude_identity_client(PROFILE_URL)?
        .get(PROFILE_URL)
        .bearer_auth(access)
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .map_err(
            |_| "Could not verify the Claude Code account. Check your connection and try again.",
        )?;
    match response.status().as_u16() {
        200 => {
            let bytes = response
                .bytes()
                .map_err(|_| "Could not read the Claude Code account response")?;
            let value = serde_json::from_slice(&bytes)
                .map_err(|_| "Invalid Claude Code account response")?;
            parse_profile(&value)
                .map(Some)
                .ok_or_else(|| "Claude did not return an account and organization ID".into())
        }
        401 | 403 => Ok(None),
        429 => {
            Err("Claude account verification is rate limited (HTTP 429). Try again later.".into())
        }
        status => Err(format!(
            "Could not verify the Claude Code account (HTTP {status}). Try again later."
        )),
    }
}

fn bind(mut document: Value, source: Source, identity: Identity) -> Result<String, String> {
    document["usagebarCredentialOwner"] = Value::String("claude-code".into());
    document[LINK] = serde_json::to_value(Link { source, identity })
        .map_err(|_| "Could not encode the Claude Code account link")?;
    serde_json::to_string(&document).map_err(|_| "Could not encode Claude Code credentials".into())
}

pub(crate) fn resolve_current_claude_auth() -> Result<ResolvedClaudeAuth, String> {
    let now = crate::now_utc_unix_ms();
    for source in SOURCES {
        let Some(document) = read_source(source)? else {
            continue;
        };
        let Some(access) = valid_access(&document, now) else {
            continue;
        };
        let Some(profile) = read_profile(access)? else {
            return Err(format!(
                "Could not verify the Claude Code sign-in. {RUN_CLAUDE}"
            ));
        };
        let account_id = format!(
            "{}:{}",
            profile.identity.account_id, profile.identity.organization_id
        );
        return Ok(ResolvedClaudeAuth {
            auth_json: bind(document, source, profile.identity)?,
            email: profile.email,
            account_id,
        });
    }
    Err(format!(
        "No current Claude Code sign-in was found. {RUN_CLAUDE}"
    ))
}

fn updated_document(
    current: &Value,
    now: i64,
    mut read_source: impl FnMut(Source) -> Result<Option<Value>, String>,
    mut read_profile: impl FnMut(&str) -> Result<Option<Profile>, String>,
) -> Result<Option<String>, String> {
    match current.get("usagebarCredentialOwner") {
        None => {} // Older imports had no owner marker.
        Some(value) if value.as_str() == Some("claude-code") => {}
        Some(_) => {
            return Err("The selected Claude credentials do not belong to Claude Code".into());
        }
    }
    if let Some(link) = current.get(LINK) {
        let link: Link =
            serde_json::from_value(link.clone()).map_err(|_| "Invalid Claude Code account link")?;
        let Some(candidate) = read_source(link.source)? else {
            return Ok(None);
        };
        let Some(access) = valid_access(&candidate, now) else {
            return Ok(None);
        };
        if Some(access) == token(current, "accessToken") {
            return Ok(None);
        }
        let Some(profile) = read_profile(access)? else {
            return Ok(None);
        };
        if profile.identity != link.identity {
            return Err("Claude Code is signed in to a different account. Sign in to the account selected in UsageBar.".into());
        }
        return bind(candidate, link.source, link.identity).map(Some);
    }

    // Legacy copies have no source or verified identity. Match the old chain
    // first, or verify both access tokens while the old one still works.
    let mut unproven_source = false;
    for source in SOURCES {
        let Some(candidate) = read_source(source)? else {
            continue;
        };
        let Some(access) = valid_access(&candidate, now) else {
            continue;
        };
        let same_chain = Some(access) == token(current, "accessToken")
            || token(&candidate, "refreshToken")
                .is_some_and(|refresh| Some(refresh) == token(current, "refreshToken"));
        let old_profile = if same_chain {
            None
        } else {
            let Some(access) = valid_access(current, now) else {
                unproven_source = true;
                continue;
            };
            let Some(profile) = read_profile(access)? else {
                unproven_source = true;
                continue;
            };
            Some(profile)
        };
        let Some(profile) = read_profile(access)? else {
            continue;
        };
        if old_profile.is_some_and(|old| old.identity != profile.identity) {
            unproven_source = true;
            continue;
        }
        return bind(candidate, source, profile.identity).map(Some);
    }
    if unproven_source && valid_access(current, now).is_none() {
        return Err(LINK_REQUIRED.into());
    }
    Ok(None)
}

pub(crate) fn sync(data_dir: &Path, key: &str) -> Result<Option<String>, String> {
    sync_with(
        data_dir,
        key,
        crate::now_utc_unix_ms(),
        read_source,
        read_profile,
    )
}

fn sync_with(
    data_dir: &Path,
    key: &str,
    now: i64,
    read_source: impl FnMut(Source) -> Result<Option<Value>, String>,
    read_profile: impl FnMut(&str) -> Result<Option<Profile>, String>,
) -> Result<Option<String>, String> {
    let previous =
        crate::protected_store::transaction(data_dir, |store| store.read("claude", key))?.ok_or(
            "The selected Claude import is unavailable. Select the account again in Settings.",
        )?;
    let current: Value = serde_json::from_str(&previous).map_err(|_| "Invalid Claude import")?;
    let Some(updated) = updated_document(&current, now, read_source, read_profile)? else {
        return Ok(None);
    };
    crate::protected_store::transaction(data_dir, |store| {
        if store.read("claude", key)?.as_deref() != Some(previous.as_str()) {
            return Err("The selected Claude import changed. Try again.".into());
        }
        store
            .save("claude", key, &updated)
            .map_err(|_| "Could not save updated Claude Code credentials. Try again.".into())
    })?;
    let saved: Value =
        serde_json::from_str(&updated).map_err(|_| "Could not read updated Claude import")?;
    Ok((token(&saved, "accessToken") != token(&current, "accessToken")).then_some(updated))
}

#[cfg(test)]
#[path = "claude_import_tests.rs"]
mod tests;
