#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/luisleineweber/usagebar/releases/tags";
const GITHUB_DOWNLOAD_PREFIX: &str =
    "https://github.com/luisleineweber/usagebar/releases/download/";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    draft: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[tauri::command]
pub async fn download_github_update(app: AppHandle, version: String) -> Result<String, String> {
    let version = normalize_version(&version)?;
    let tag = format!("v{version}");
    let client = reqwest::Client::new();
    let release_url = format!("{GITHUB_RELEASES_API}/{tag}");
    let response = client
        .get(release_url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header(reqwest::header::USER_AGENT, format!("UsageBar/{version}"))
        .send()
        .await
        .map_err(|error| format!("GitHub release lookup failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub release lookup failed with {}",
            response.status()
        ));
    }

    let release = response
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("GitHub release metadata is invalid: {error}"))?;
    if release.draft {
        return Err("GitHub release is still a draft".to_string());
    }

    let asset = release
        .assets
        .into_iter()
        .find(|asset| is_windows_setup_asset(&asset.name, &version))
        .ok_or_else(|| format!("No Windows installer found for {tag}"))?;

    if !asset
        .browser_download_url
        .starts_with(&format!("{GITHUB_DOWNLOAD_PREFIX}{tag}/"))
    {
        return Err("GitHub installer URL is not trusted".to_string());
    }

    let installer_response = client
        .get(&asset.browser_download_url)
        .header(reqwest::header::USER_AGENT, format!("UsageBar/{version}"))
        .send()
        .await
        .map_err(|error| format!("Update download failed: {error}"))?;

    if !installer_response.status().is_success() {
        return Err(format!(
            "Update download failed with {}",
            installer_response.status()
        ));
    }

    let installer_bytes = installer_response
        .bytes()
        .await
        .map_err(|error| format!("Update download failed: {error}"))?;
    verify_digest(&asset, &installer_bytes)?;

    let temp_dir = app
        .path()
        .temp_dir()
        .map_err(|error| format!("Could not resolve the update directory: {error}"))?;
    std::fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("Could not create the update directory: {error}"))?;
    let installer_path = temp_dir.join(&asset.name);
    std::fs::write(&installer_path, &installer_bytes)
        .map_err(|error| format!("Could not save the update installer: {error}"))?;

    Ok(installer_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn install_downloaded_update(app: AppHandle, installer_path: String) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, installer_path);
        return Err("Direct GitHub installer updates are supported on Windows only".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let installer_path = validate_installer_path(&app, &installer_path)?;
        let app_path = std::env::current_exe()
            .map_err(|error| format!("Could not resolve the current app path: {error}"))?;
        let script = format!(
            "$installer = '{}'; $app = '{}'; $appPid = {}; while (Get-Process -Id $appPid -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 100 }}; $process = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -WindowStyle Hidden; $process.WaitForExit(); if ($process.ExitCode -eq 0) {{ Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue; Start-Process -FilePath $app -WindowStyle Hidden }}",
            powershell_literal(&installer_path),
            powershell_literal(&app_path),
            std::process::id()
        );
        let encoded_script = encode_powershell_script(&script);

        std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden"])
            .arg("-EncodedCommand")
            .arg(&encoded_script)
            .spawn()
            .map_err(|error| format!("Could not start the update installer: {error}"))?;

        app.exit(0);
        Ok(())
    }
}

fn normalize_version(version: &str) -> Result<String, String> {
    let normalized = version
        .trim()
        .strip_prefix('v')
        .or_else(|| version.trim().strip_prefix('V'))
        .unwrap_or(version.trim());
    if normalized.is_empty()
        || !normalized
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-'))
        || !normalized
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_digit())
    {
        return Err("Update version is invalid".to_string());
    }
    Ok(normalized.to_string())
}

fn is_windows_setup_asset(name: &str, version: &str) -> bool {
    name == format!("UsageBar_{version}_x64-setup.exe")
}

fn verify_digest(asset: &GithubAsset, bytes: &[u8]) -> Result<(), String> {
    let Some(expected) = asset.digest.as_deref() else {
        return Err("GitHub release has no SHA-256 installer digest".to_string());
    };
    let Some(expected) = expected.strip_prefix("sha256:") else {
        return Err("GitHub installer digest uses an unsupported algorithm".to_string());
    };
    let actual = format!("{:x}", Sha256::digest(bytes));
    if actual != expected {
        return Err("Downloaded installer failed its GitHub digest check".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn validate_installer_path(app: &AppHandle, installer_path: &str) -> Result<PathBuf, String> {
    let temp_dir = app
        .path()
        .temp_dir()
        .map_err(|error| format!("Could not resolve the update directory: {error}"))?;
    let canonical_temp_dir = temp_dir
        .canonicalize()
        .map_err(|error| format!("Could not resolve the update directory: {error}"))?;
    let path = PathBuf::from(installer_path);
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("Could not resolve the downloaded installer: {error}"))?;

    if !canonical_path.starts_with(&canonical_temp_dir) {
        return Err("Downloaded installer is outside the update directory".to_string());
    }
    let Some(file_name) = canonical_path.file_name().and_then(|value| value.to_str()) else {
        return Err("Downloaded installer has no valid file name".to_string());
    };
    if !file_name.starts_with("UsageBar_") || !file_name.ends_with("_x64-setup.exe") {
        return Err("Downloaded installer name is invalid".to_string());
    }
    Ok(canonical_path)
}

#[cfg(target_os = "windows")]
fn powershell_literal(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn encode_powershell_script(script: &str) -> String {
    let bytes = script
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();
    BASE64.encode(bytes)
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};

    use super::{GithubAsset, is_windows_setup_asset, normalize_version, verify_digest};

    #[test]
    fn normalizes_release_versions() {
        assert_eq!(
            normalize_version("v0.1.0-alpha.9").unwrap(),
            "0.1.0-alpha.9"
        );
    }

    #[test]
    fn rejects_path_like_versions() {
        assert!(normalize_version("../installer.exe").is_err());
    }

    #[test]
    fn selects_only_the_usagebar_x64_setup_asset() {
        assert!(is_windows_setup_asset(
            "UsageBar_0.1.0-alpha.9_x64-setup.exe",
            "0.1.0-alpha.9"
        ));
        assert!(!is_windows_setup_asset(
            "UsageBar_0.1.0-alpha.9_x64-setup.exe.sig",
            "0.1.0-alpha.9"
        ));
    }

    #[test]
    fn verifies_the_published_installer_digest() {
        let bytes = b"installer";
        let asset = GithubAsset {
            name: "UsageBar_0.1.0-alpha.9_x64-setup.exe".to_string(),
            browser_download_url: String::new(),
            digest: Some(format!("sha256:{:x}", Sha256::digest(bytes))),
        };

        assert!(verify_digest(&asset, bytes).is_ok());
        assert!(verify_digest(&asset, b"tampered").is_err());
    }
}
