use std::path::{Path, PathBuf};

const DEV_IDENTIFIER: &str = "com.sunstory.usagebar.dev";
const RELEASE_IDENTIFIER: &str = "com.sunstory.usagebar";
const MIGRATION_MARKER: &str = ".dev-data-migration-v1";

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct MigrationReport {
    pub(crate) copied_files: usize,
}

pub(crate) fn migrate_for_dev(target_dir: &Path) -> Result<MigrationReport, String> {
    if target_dir.file_name().and_then(|name| name.to_str()) != Some(DEV_IDENTIFIER) {
        return Ok(MigrationReport::default());
    }

    let Some(parent) = target_dir.parent() else {
        return Ok(MigrationReport::default());
    };

    migrate_from_source(&parent.join(RELEASE_IDENTIFIER), target_dir)
}

fn migrate_from_source(source_dir: &Path, target_dir: &Path) -> Result<MigrationReport, String> {
    let marker_path = target_dir.join(MIGRATION_MARKER);
    if marker_path.exists() || !source_dir.exists() {
        return Ok(MigrationReport::default());
    }

    let source_settings = existing_settings_path(source_dir);
    let source_secrets = source_dir.join("provider-secrets.json");
    let source_plugin_data = source_dir.join("plugins_data");
    if source_settings.is_none() && !source_secrets.exists() && !source_plugin_data.exists() {
        return Ok(MigrationReport::default());
    }

    std::fs::create_dir_all(target_dir)
        .map_err(|error| format!("could not create dev data directory: {error}"))?;
    let mut report = MigrationReport::default();

    if let Some(source_settings) = source_settings {
        merge_settings(&source_settings, &target_settings_path(target_dir))?;
        report.copied_files += 1;
    }
    if copy_file_if_missing(&source_secrets, &target_dir.join("provider-secrets.json"))? {
        report.copied_files += 1;
    }
    if source_plugin_data.exists() {
        report.copied_files +=
            copy_tree_if_missing(&source_plugin_data, &target_dir.join("plugins_data"))?;
    }

    std::fs::write(&marker_path, b"migrated")
        .map_err(|error| format!("could not write dev data migration marker: {error}"))?;
    Ok(report)
}

fn settings_path(dir: &Path) -> PathBuf {
    dir.join("settings.json")
}

fn existing_settings_path(dir: &Path) -> Option<PathBuf> {
    [settings_path(dir), dir.join(".store").join("settings.json")]
        .into_iter()
        .find(|path| path.exists())
}

fn target_settings_path(dir: &Path) -> PathBuf {
    existing_settings_path(dir).unwrap_or_else(|| settings_path(dir))
}

fn merge_settings(source: &Path, target: &Path) -> Result<(), String> {
    let source_value = read_settings_object(source)?;
    let mut target_value = if target.exists() {
        read_settings_object(target)?
    } else {
        serde_json::Map::new()
    };
    for (key, value) in source_value {
        target_value.insert(key, value);
    }

    let encoded = serde_json::to_vec_pretty(&target_value)
        .map_err(|error| format!("could not encode migrated settings: {error}"))?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create settings directory: {error}"))?;
    }
    crate::atomic_file::write(target, &encoded)
        .map_err(|error| format!("could not write migrated settings: {error}"))
}

fn read_settings_object(path: &Path) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|error| format!("could not read settings from {}: {error}", path.display()))?;
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|error| format!("could not parse settings from {}: {error}", path.display()))?
        .as_object()
        .cloned()
        .ok_or_else(|| format!("settings file is not a JSON object: {}", path.display()))
}

fn copy_file_if_missing(source: &Path, target: &Path) -> Result<bool, String> {
    if !source.exists() || target.exists() {
        return Ok(false);
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    std::fs::copy(source, target).map_err(|error| {
        format!(
            "could not copy {} to {}: {error}",
            source.display(),
            target.display()
        )
    })?;
    Ok(true)
}

fn copy_tree_if_missing(source: &Path, target: &Path) -> Result<usize, String> {
    let mut copied = 0;
    for entry in std::fs::read_dir(source)
        .map_err(|error| format!("could not read {}: {error}", source.display()))?
    {
        let entry = entry.map_err(|error| format!("could not inspect migrated data: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copied += copy_tree_if_missing(&source_path, &target_path)?;
        } else if copy_file_if_missing(&source_path, &target_path)? {
            copied += 1;
        }
    }
    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "usagebar-dev-migration-{}-{}",
            label,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn migrates_alpha5_settings_secrets_and_account_data_once() {
        let root = temp_dir("alpha5");
        let source = root.join(RELEASE_IDENTIFIER);
        let target = root.join(DEV_IDENTIFIER);
        fs::create_dir_all(source.join("plugins_data/codex")).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(
            settings_path(&source),
            r#"{"plugins":{"order":["claude","codex"],"disabled":["codex"]},"themeMode":"dark"}"#,
        )
        .unwrap();
        fs::write(
            source.join("provider-secrets.json"),
            "encrypted-alpha5-secrets",
        )
        .unwrap();
        fs::write(
            source.join("plugins_data/codex/accounts.json"),
            "alpha5-account",
        )
        .unwrap();
        fs::write(
            settings_path(&target),
            r#"{"plugins":{"order":["codex"],"disabled":[]}}"#,
        )
        .unwrap();

        let report = migrate_for_dev(&target).unwrap();

        assert_eq!(report.copied_files, 3);
        let migrated_settings: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(settings_path(&target)).unwrap()).unwrap();
        assert_eq!(
            migrated_settings["plugins"]["order"],
            serde_json::json!(["claude", "codex"])
        );
        assert_eq!(
            migrated_settings["plugins"]["disabled"],
            serde_json::json!(["codex"])
        );
        assert_eq!(migrated_settings["themeMode"], "dark");
        assert_eq!(
            fs::read_to_string(target.join("provider-secrets.json")).unwrap(),
            "encrypted-alpha5-secrets"
        );
        assert_eq!(
            fs::read_to_string(target.join("plugins_data/codex/accounts.json")).unwrap(),
            "alpha5-account"
        );

        fs::write(settings_path(&source), "changed-alpha5-settings").unwrap();
        fs::write(settings_path(&target), "local-alpha6-settings").unwrap();

        let second = migrate_for_dev(&target).unwrap();

        assert_eq!(second.copied_files, 0);
        assert_eq!(
            fs::read_to_string(settings_path(&target)).unwrap(),
            "local-alpha6-settings"
        );

        fs::remove_dir_all(root).unwrap();
    }
}
