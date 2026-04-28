use crate::plugin_engine::runtime::{MetricLine, PluginOutput};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const CACHE_FILE_NAME: &str = "usage-api-cache.json";
const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_ENABLED_PLUGINS: &[&str] = &["claude", "codex", "cursor"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedPluginSnapshot {
    pub provider_id: String,
    pub display_name: String,
    pub plan: Option<String>,
    pub lines: Vec<MetricLine>,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageApiCacheFile {
    version: u32,
    snapshots: HashMap<String, CachedPluginSnapshot>,
}

pub(super) struct CacheState {
    pub snapshots: HashMap<String, CachedPluginSnapshot>,
    pub app_data_dir: PathBuf,
    pub known_plugin_ids: Vec<String>,
}

pub(super) fn cache_state() -> &'static Mutex<CacheState> {
    static STATE: OnceLock<Mutex<CacheState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(CacheState {
            snapshots: HashMap::new(),
            app_data_dir: PathBuf::new(),
            known_plugin_ids: Vec::new(),
        })
    })
}

pub fn load_cache(app_data_dir: &Path) -> HashMap<String, CachedPluginSnapshot> {
    let path = app_data_dir.join(CACHE_FILE_NAME);
    let data = match std::fs::read_to_string(&path) {
        Ok(data) => data,
        Err(_) => return HashMap::new(),
    };

    match serde_json::from_str::<UsageApiCacheFile>(&data) {
        Ok(file) if file.version == 1 => file.snapshots,
        Ok(_) => {
            log::warn!("usage-api-cache.json has unsupported version, starting empty");
            HashMap::new()
        }
        Err(error) => {
            log::warn!("failed to parse usage-api-cache.json: {}, starting empty", error);
            HashMap::new()
        }
    }
}

fn save_cache(app_data_dir: &Path, snapshots: &HashMap<String, CachedPluginSnapshot>) {
    let file = UsageApiCacheFile {
        version: 1,
        snapshots: snapshots.clone(),
    };
    let path = app_data_dir.join(CACHE_FILE_NAME);
    let tmp_path = app_data_dir.join(".usage-api-cache.json.tmp");

    match serde_json::to_string(&file) {
        Ok(json) => {
            if let Err(error) = std::fs::write(&tmp_path, &json) {
                log::warn!("failed to write temp usage API cache file: {}", error);
                return;
            }
            if let Err(error) = std::fs::rename(&tmp_path, &path) {
                log::warn!("failed to replace usage API cache file: {}", error);
            }
        }
        Err(error) => log::warn!("failed to serialize usage API cache: {}", error),
    }
}

pub fn init(app_data_dir: &Path, known_plugin_ids: Vec<String>) {
    let snapshots = load_cache(app_data_dir);
    let mut state = cache_state().lock().expect("cache state poisoned");
    state.snapshots = snapshots;
    state.app_data_dir = app_data_dir.to_path_buf();
    state.known_plugin_ids = known_plugin_ids;
}

pub fn cache_successful_output(output: &PluginOutput) {
    let fetched_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default();

    let snapshot = CachedPluginSnapshot {
        provider_id: output.provider_id.clone(),
        display_name: output.display_name.clone(),
        plan: output.plan.clone(),
        lines: output.lines.clone(),
        fetched_at,
    };

    let mut state = cache_state().lock().expect("cache state poisoned");
    state
        .snapshots
        .insert(output.provider_id.clone(), snapshot);
    save_cache(&state.app_data_dir, &state.snapshots);
}

#[derive(Deserialize)]
struct SettingsFile {
    plugins: Option<PluginSettingsJson>,
}

#[derive(Deserialize)]
struct PluginSettingsJson {
    order: Option<Vec<String>>,
    disabled: Option<Vec<String>>,
}

fn settings_file_paths(app_data_dir: &Path) -> [PathBuf; 2] {
    [
        app_data_dir.join(SETTINGS_FILE_NAME),
        app_data_dir.join(".store").join(SETTINGS_FILE_NAME),
    ]
}

fn read_plugin_settings(app_data_dir: &Path) -> (Vec<String>, HashSet<String>, bool) {
    for path in settings_file_paths(app_data_dir) {
        let data = match std::fs::read_to_string(&path) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                log::warn!("failed to read plugin settings from {}: {}", path.display(), error);
                continue;
            }
        };

        let settings = match serde_json::from_str::<SettingsFile>(&data) {
            Ok(settings) => settings,
            Err(error) => {
                log::warn!("failed to parse plugin settings from {}: {}", path.display(), error);
                continue;
            }
        };
        let plugin_settings = settings.plugins.unwrap_or(PluginSettingsJson {
            order: None,
            disabled: None,
        });
        let has_settings = plugin_settings.order.is_some() || plugin_settings.disabled.is_some();
        let order = plugin_settings.order.unwrap_or_default();
        let disabled = plugin_settings
            .disabled
            .unwrap_or_default()
            .into_iter()
            .collect();
        return (order, disabled, has_settings);
    }

    (Vec::new(), HashSet::new(), false)
}

pub(super) fn enabled_snapshots_ordered(state: &CacheState) -> Vec<CachedPluginSnapshot> {
    let (settings_order, disabled, has_settings) = read_plugin_settings(&state.app_data_dir);
    let default_enabled: HashSet<&str> = DEFAULT_ENABLED_PLUGINS.iter().copied().collect();

    let is_enabled = |id: &str| -> bool {
        if has_settings {
            !disabled.contains(id)
        } else {
            default_enabled.contains(id)
        }
    };

    let mut ordered = Vec::new();
    let mut seen = HashSet::new();
    for id in settings_order {
        if seen.insert(id.clone()) {
            ordered.push(id);
        }
    }
    for id in &state.known_plugin_ids {
        if seen.insert(id.clone()) {
            ordered.push(id.clone());
        }
    }

    ordered
        .into_iter()
        .filter(|id| is_enabled(id))
        .filter_map(|id| state.snapshots.get(&id).cloned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::runtime::ProgressFormat;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "usagebar-{}-{}",
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn make_snapshot(id: &str, name: &str) -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: id.to_string(),
            display_name: name.to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![],
            fetched_at: "2026-03-26T08:15:30Z".to_string(),
        }
    }

    #[test]
    fn snapshot_serializes_with_fetched_at() {
        let snapshot = make_snapshot("claude", "Claude");
        let json: serde_json::Value = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(json["fetchedAt"], "2026-03-26T08:15:30Z");
        assert!(json.get("fetched_at").is_none());
    }

    #[test]
    fn cache_file_round_trip() {
        let dir = temp_dir("cache-round-trip");
        std::fs::create_dir_all(&dir).unwrap();

        let mut snapshots = HashMap::new();
        snapshots.insert("claude".to_string(), make_snapshot("claude", "Claude"));

        save_cache(&dir, &snapshots);
        let loaded = load_cache(&dir);

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded["claude"].provider_id, "claude");
        assert_eq!(loaded["claude"].fetched_at, "2026-03-26T08:15:30Z");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_cache_returns_empty_on_missing_file() {
        let dir = temp_dir("missing-cache");
        let loaded = load_cache(&dir);
        assert!(loaded.is_empty());
    }

    #[test]
    fn load_cache_returns_empty_on_invalid_json() {
        let dir = temp_dir("bad-cache");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(CACHE_FILE_NAME), "not json").unwrap();

        let loaded = load_cache(&dir);
        assert!(loaded.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn snapshot_with_progress_line_round_trips() {
        let snapshot = CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: Some("Max 20x".to_string()),
            lines: vec![MetricLine::Progress {
                label: "Session".to_string(),
                used: 42.0,
                limit: 100.0,
                format: ProgressFormat::Percent,
                resets_at: Some("2026-03-26T12:00:00Z".to_string()),
                period_duration_ms: Some(14_400_000),
                color: None,
            }],
            fetched_at: "2026-03-26T08:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&snapshot).unwrap();
        let deserialized: CachedPluginSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.provider_id, "claude");
        assert_eq!(deserialized.lines.len(), 1);
    }

    #[test]
    fn enabled_snapshots_respects_store_settings_path() {
        let dir = temp_dir("store-settings");
        std::fs::create_dir_all(dir.join(".store")).unwrap();
        std::fs::write(
            dir.join(".store").join(SETTINGS_FILE_NAME),
            r#"{"plugins":{"order":["cursor","claude"],"disabled":["claude"]}}"#,
        )
        .unwrap();

        let mut snapshots = HashMap::new();
        snapshots.insert("claude".to_string(), make_snapshot("claude", "Claude"));
        snapshots.insert("cursor".to_string(), make_snapshot("cursor", "Cursor"));
        let state = CacheState {
            snapshots,
            app_data_dir: dir.clone(),
            known_plugin_ids: vec!["claude".to_string(), "cursor".to_string()],
        };

        let enabled = enabled_snapshots_ordered(&state);
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].provider_id, "cursor");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
