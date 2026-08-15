use crate::plugin_engine::freshness::{DataFreshness, DataFreshnessGroups, DataFreshnessState};
use crate::plugin_engine::runtime::{MetricLine, PluginOutput, ProviderInstanceRef, UsageHistory};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const CACHE_FILE_NAME: &str = "usage-api-cache.json";
const SETTINGS_FILE_NAME: &str = "settings.json";
const DEFAULT_ENABLED_PLUGINS: &[&str] = &["claude", "codex", "cursor"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedPluginSnapshot {
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_ref: Option<ProviderInstanceRef>,
    pub display_name: String,
    pub plan: Option<String>,
    pub lines: Vec<MetricLine>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<UsageHistory>,
    pub fetched_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freshness: Option<DataFreshnessGroups>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageApiCacheFile {
    version: u32,
    snapshots: HashMap<String, CachedPluginSnapshot>,
}

#[derive(Debug)]
pub(crate) enum SnapshotReadError {
    CacheMissing,
    CacheUnreadable,
    CacheInvalid,
    UnsupportedCacheVersion(u32),
    SettingsUnreadable,
    SettingsInvalid,
}

impl fmt::Display for SnapshotReadError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CacheMissing => formatter.write_str("usage cache does not exist yet"),
            Self::CacheUnreadable => formatter.write_str("usage cache could not be read"),
            Self::CacheInvalid => formatter.write_str("usage cache is invalid"),
            Self::UnsupportedCacheVersion(version) => {
                write!(formatter, "usage cache version {version} is not supported")
            }
            Self::SettingsUnreadable => formatter.write_str("provider settings could not be read"),
            Self::SettingsInvalid => formatter.write_str("provider settings are invalid"),
        }
    }
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
    match read_cache(app_data_dir) {
        Ok(snapshots) => snapshots,
        Err(error) => {
            if !matches!(error, SnapshotReadError::CacheMissing) {
                log::warn!("failed to load usage-api-cache.json: {error}, starting empty");
            }
            HashMap::new()
        }
    }
}

pub(crate) fn read_cache(
    app_data_dir: &Path,
) -> Result<HashMap<String, CachedPluginSnapshot>, SnapshotReadError> {
    let path = app_data_dir.join(CACHE_FILE_NAME);
    let data = std::fs::read_to_string(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            SnapshotReadError::CacheMissing
        } else {
            SnapshotReadError::CacheUnreadable
        }
    })?;
    let file: UsageApiCacheFile =
        serde_json::from_str(&data).map_err(|_| SnapshotReadError::CacheInvalid)?;
    if file.version != 1 && file.version != 2 {
        return Err(SnapshotReadError::UnsupportedCacheVersion(file.version));
    }
    Ok(file.snapshots)
}

fn save_cache(app_data_dir: &Path, snapshots: &HashMap<String, CachedPluginSnapshot>) {
    let file = UsageApiCacheFile {
        version: 2,
        snapshots: snapshots.clone(),
    };
    let path = app_data_dir.join(CACHE_FILE_NAME);
    match serde_json::to_string(&file) {
        Ok(json) => {
            if let Err(error) = crate::atomic_file::write(&path, json.as_bytes()) {
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

fn retain_cached_history(
    output: &mut PluginOutput,
    snapshots: &HashMap<String, CachedPluginSnapshot>,
) {
    if output.history.is_none() {
        let key = output
            .instance_ref
            .as_ref()
            .map(provider_instance_key)
            .unwrap_or_else(|| output.provider_id.clone());
        output.history = snapshots
            .get(&key)
            .and_then(|snapshot| snapshot.history.clone());
    }
}

fn history_has_cost(history: &UsageHistory) -> bool {
    history.entries.iter().any(|entry| entry.cost_usd.is_some())
}

fn retained_marker(
    previous: Option<&CachedPluginSnapshot>,
    previous_marker: Option<&DataFreshness>,
    has_previous_data: bool,
) -> Option<DataFreshness> {
    if !has_previous_data {
        return None;
    }

    previous_marker
        .map(DataFreshness::retained_from)
        .or_else(|| {
            previous.map(|snapshot| DataFreshness {
                state: DataFreshnessState::Retained,
                observed_at: snapshot.fetched_at.clone(),
            })
        })
}

fn build_freshness(
    output: &PluginOutput,
    previous: Option<&CachedPluginSnapshot>,
    history_was_returned: bool,
    observed_at: &str,
) -> DataFreshnessGroups {
    let previous_history = previous.and_then(|snapshot| snapshot.history.as_ref());
    let history = output.history.as_ref();
    let previous_freshness = previous.and_then(|snapshot| snapshot.freshness.as_ref());
    let history_freshness = if history_was_returned {
        history.map(|_| DataFreshness::fresh(observed_at))
    } else {
        retained_marker(
            previous,
            previous_freshness.and_then(|freshness| freshness.history.as_ref()),
            previous_history.is_some(),
        )
    };
    let cost_freshness = if history.is_some_and(history_has_cost) {
        if history_was_returned {
            Some(DataFreshness::fresh(observed_at))
        } else {
            retained_marker(
                previous,
                previous_freshness.and_then(|freshness| freshness.cost.as_ref()),
                previous_history.is_some_and(history_has_cost),
            )
        }
    } else {
        None
    };
    let quota_freshness = output
        .lines
        .iter()
        .any(|line| matches!(line, MetricLine::Progress { .. }))
        .then(|| DataFreshness::fresh(observed_at));

    DataFreshnessGroups {
        quota: quota_freshness,
        cost: cost_freshness,
        history: history_freshness,
    }
}

pub fn cache_successful_output(output: &mut PluginOutput) {
    let fetched_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default();

    let mut state = cache_state().lock().expect("cache state poisoned");
    let key = output
        .instance_ref
        .as_ref()
        .map(provider_instance_key)
        .unwrap_or_else(|| output.provider_id.clone());
    let previous = state.snapshots.get(&key);
    let history_was_returned = output.history.is_some();
    retain_cached_history(output, &state.snapshots);

    let freshness = build_freshness(output, previous, history_was_returned, &fetched_at);
    output.freshness = Some(freshness.clone());

    let snapshot = CachedPluginSnapshot {
        provider_id: output.provider_id.clone(),
        instance_ref: output.instance_ref.clone(),
        display_name: output.display_name.clone(),
        plan: output.plan.clone(),
        lines: output.lines.clone(),
        history: output.history.clone(),
        fetched_at,
        freshness: Some(freshness),
    };

    state.snapshots.insert(key, snapshot);
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

fn read_plugin_settings_strict(
    app_data_dir: &Path,
) -> Result<(Vec<String>, HashSet<String>, bool), SnapshotReadError> {
    for path in settings_file_paths(app_data_dir) {
        let data = match std::fs::read_to_string(&path) {
            Ok(data) => data,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err(SnapshotReadError::SettingsUnreadable),
        };

        let settings: SettingsFile =
            serde_json::from_str(&data).map_err(|_| SnapshotReadError::SettingsInvalid)?;
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
        return Ok((order, disabled, has_settings));
    }

    Ok((Vec::new(), HashSet::new(), false))
}

fn read_plugin_settings(app_data_dir: &Path) -> (Vec<String>, HashSet<String>, bool) {
    match read_plugin_settings_strict(app_data_dir) {
        Ok(settings) => settings,
        Err(error) => {
            log::warn!("failed to load provider settings: {error}, using defaults");
            (Vec::new(), HashSet::new(), false)
        }
    }
}

pub(crate) fn read_enabled_snapshots(
    app_data_dir: &Path,
) -> Result<Vec<CachedPluginSnapshot>, SnapshotReadError> {
    let snapshots = read_cache(app_data_dir)?;
    let (settings_order, disabled, has_settings) = read_plugin_settings_strict(app_data_dir)?;
    let default_enabled: HashSet<&str> = DEFAULT_ENABLED_PLUGINS.iter().copied().collect();
    let mut remaining: Vec<_> = snapshots.keys().cloned().collect();
    remaining.sort();

    let mut ordered = Vec::new();
    let mut seen = HashSet::new();
    let provider_order = settings_order
        .into_iter()
        .chain(remaining.iter().filter_map(|key| {
            snapshots
                .get(key)
                .map(|snapshot| snapshot.provider_id.clone())
        }))
        .collect::<Vec<_>>();
    for provider_id in provider_order {
        let enabled = if has_settings {
            !disabled.contains(&provider_id)
        } else {
            default_enabled.contains(provider_id.as_str())
        };
        if !enabled || !seen.insert(provider_id.clone()) {
            continue;
        }
        for key in &remaining {
            if snapshots
                .get(key)
                .is_some_and(|snapshot| snapshot.provider_id == provider_id)
            {
                ordered.push(snapshots[key].clone());
            }
        }
    }
    Ok(ordered)
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
        .flat_map(|provider_id| {
            let mut keys: Vec<_> = state
                .snapshots
                .iter()
                .filter(|(_, snapshot)| snapshot.provider_id == provider_id)
                .map(|(key, _)| key)
                .collect();
            keys.sort();
            keys.into_iter()
                .filter_map(|key| state.snapshots.get(key).cloned())
                .collect::<Vec<_>>()
        })
        .collect()
}

fn provider_instance_key(instance_ref: &ProviderInstanceRef) -> String {
    instance_ref
        .instance_id
        .as_ref()
        .map(|instance_id| format!("{}\0{}", instance_ref.provider_id, instance_id))
        .unwrap_or_else(|| instance_ref.provider_id.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::freshness::{DataFreshness, DataFreshnessState};
    use crate::plugin_engine::runtime::{MetricAvailability, ProgressFormat, UsageHistoryEntry};

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
            instance_ref: None,
            display_name: name.to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![],
            history: None,
            fetched_at: "2026-03-26T08:15:30Z".to_string(),
            freshness: None,
        }
    }

    fn make_history() -> UsageHistory {
        UsageHistory {
            version: 1,
            source: "ccusage".to_string(),
            time_zone: "system-local".to_string(),
            entries: vec![UsageHistoryEntry {
                period_start: "2026-07-28T22:00:00Z".to_string(),
                period_end: "2026-07-29T22:00:00Z".to_string(),
                model: None,
                project: None,
                account: None,
                cost_usd: None,
                requests: None,
                input_tokens: None,
                output_tokens: None,
                cache_read_tokens: None,
                cache_creation_tokens: None,
                reasoning_tokens: None,
                total_tokens: Some(42.0),
            }],
        }
    }

    #[test]
    fn successful_output_without_history_retains_cached_provider_history() {
        let mut snapshot = make_snapshot("codex", "Codex");
        snapshot.history = Some(make_history());
        let snapshots = HashMap::from([("codex".to_string(), snapshot)]);
        let mut output = PluginOutput {
            provider_id: "codex".to_string(),
            instance_ref: None,
            display_name: "Codex".to_string(),
            plan: Some("Plus".to_string()),
            lines: vec![],
            details: None,
            icon_url: "codex.svg".to_string(),
            error: None,
            history: None,
            freshness: None,
        };

        retain_cached_history(&mut output, &snapshots);

        let history = output.history.expect("cached history should be retained");
        assert_eq!(history.source, "ccusage");
        assert_eq!(history.entries.len(), 1);
    }

    #[test]
    fn retained_history_is_scoped_to_the_provider_instance() {
        let mut profile_a = make_snapshot("codex", "Codex A");
        profile_a.instance_ref = Some(ProviderInstanceRef {
            provider_id: "codex".to_string(),
            instance_id: Some("profile-a".to_string()),
        });
        profile_a.history = Some(make_history());
        let mut profile_b = make_snapshot("codex", "Codex B");
        profile_b.instance_ref = Some(ProviderInstanceRef {
            provider_id: "codex".to_string(),
            instance_id: Some("profile-b".to_string()),
        });
        profile_b.history = Some(UsageHistory {
            entries: vec![],
            ..make_history()
        });
        let snapshots = HashMap::from([
            ("codex\0profile-a".to_string(), profile_a),
            ("codex\0profile-b".to_string(), profile_b),
        ]);
        let mut output = PluginOutput {
            provider_id: "codex".to_string(),
            instance_ref: Some(ProviderInstanceRef {
                provider_id: "codex".to_string(),
                instance_id: Some("profile-b".to_string()),
            }),
            display_name: "Codex B".to_string(),
            plan: Some("Plus".to_string()),
            lines: vec![],
            details: None,
            icon_url: "codex.svg".to_string(),
            error: None,
            history: None,
            freshness: None,
        };

        retain_cached_history(&mut output, &snapshots);

        assert!(
            output
                .history
                .expect("profile B history")
                .entries
                .is_empty()
        );
    }

    #[test]
    fn host_freshness_distinguishes_current_quota_from_retained_history() {
        let mut previous = make_snapshot("codex", "Codex");
        previous.history = Some(make_history());
        previous.freshness = Some(DataFreshnessGroups {
            quota: None,
            cost: None,
            history: Some(DataFreshness::fresh("2026-03-26T07:00:00Z")),
        });

        let mut output = PluginOutput {
            provider_id: "codex".to_string(),
            instance_ref: None,
            display_name: "Codex".to_string(),
            plan: Some("Plus".to_string()),
            lines: vec![MetricLine::Progress {
                label: "Session".to_string(),
                used: Some(20.0),
                limit: Some(100.0),
                format: ProgressFormat::Percent,
                availability: None,
                resets_at: None,
                period_duration_ms: None,
                color: None,
            }],
            details: None,
            icon_url: "codex.svg".to_string(),
            error: None,
            history: None,
            freshness: None,
        };
        let snapshots = HashMap::from([(previous.provider_id.clone(), previous.clone())]);
        retain_cached_history(&mut output, &snapshots);

        let freshness = build_freshness(&output, Some(&previous), false, "2026-03-26T08:15:30Z");

        assert_eq!(
            freshness.quota.as_ref().unwrap().state,
            DataFreshnessState::Fresh
        );
        assert_eq!(
            freshness.quota.as_ref().unwrap().observed_at,
            "2026-03-26T08:15:30Z"
        );
        assert_eq!(
            freshness.history.as_ref().unwrap().state,
            DataFreshnessState::Retained
        );
        assert_eq!(
            freshness.history.as_ref().unwrap().observed_at,
            "2026-03-26T07:00:00Z"
        );

        previous.freshness = None;
        let fallback = build_freshness(&output, Some(&previous), false, "2026-03-26T08:15:30Z");
        assert_eq!(
            fallback.history.as_ref().unwrap().observed_at,
            previous.fetched_at
        );
    }

    #[test]
    fn snapshot_serializes_with_fetched_at() {
        let mut snapshot = make_snapshot("claude", "Claude");
        snapshot.freshness = Some(DataFreshnessGroups {
            quota: Some(DataFreshness::fresh("2026-03-26T08:15:30Z")),
            cost: None,
            history: None,
        });
        let json: serde_json::Value = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(json["fetchedAt"], "2026-03-26T08:15:30Z");
        assert_eq!(json["freshness"]["quota"]["state"], "fresh");
        assert_eq!(
            json["freshness"]["quota"]["observedAt"],
            "2026-03-26T08:15:30Z"
        );
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
    fn save_cache_replaces_existing_file() {
        let dir = temp_dir("cache-replace");
        std::fs::create_dir_all(&dir).unwrap();

        let mut first = HashMap::new();
        first.insert("claude".to_string(), make_snapshot("claude", "Claude"));
        save_cache(&dir, &first);

        let mut second = HashMap::new();
        second.insert("codex".to_string(), make_snapshot("codex", "Codex"));
        save_cache(&dir, &second);

        let loaded = load_cache(&dir);
        assert_eq!(loaded.len(), 1);
        assert!(loaded.contains_key("codex"));
        assert!(!loaded.contains_key("claude"));

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
            instance_ref: None,
            display_name: "Claude".to_string(),
            plan: Some("Max 20x".to_string()),
            lines: vec![MetricLine::Progress {
                label: "Session".to_string(),
                used: Some(42.0),
                limit: Some(100.0),
                format: ProgressFormat::Percent,
                availability: None,
                resets_at: Some("2026-03-26T12:00:00Z".to_string()),
                period_duration_ms: Some(14_400_000),
                color: None,
            }],
            history: None,
            fetched_at: "2026-03-26T08:00:00Z".to_string(),
            freshness: None,
        };

        let json = serde_json::to_string(&snapshot).unwrap();
        let deserialized: CachedPluginSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.provider_id, "claude");
        assert_eq!(deserialized.lines.len(), 1);
    }

    #[test]
    fn snapshot_serialization_preserves_zero_unknown_and_unsupported_progress() {
        let snapshot = CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            instance_ref: None,
            display_name: "Claude".to_string(),
            plan: None,
            lines: vec![
                MetricLine::Progress {
                    label: "Zero".to_string(),
                    used: Some(0.0),
                    limit: Some(100.0),
                    format: ProgressFormat::Percent,
                    availability: None,
                    resets_at: None,
                    period_duration_ms: None,
                    color: None,
                },
                MetricLine::Progress {
                    label: "Unknown".to_string(),
                    used: None,
                    limit: Some(100.0),
                    format: ProgressFormat::Percent,
                    availability: None,
                    resets_at: None,
                    period_duration_ms: None,
                    color: None,
                },
                MetricLine::Progress {
                    label: "Unsupported".to_string(),
                    used: None,
                    limit: None,
                    format: ProgressFormat::Percent,
                    availability: Some(MetricAvailability::Unsupported),
                    resets_at: None,
                    period_duration_ms: None,
                    color: None,
                },
            ],
            history: None,
            fetched_at: "2026-03-26T08:00:00Z".to_string(),
            freshness: None,
        };

        let json: serde_json::Value = serde_json::to_value(snapshot).unwrap();
        assert_eq!(json["lines"][0]["used"], 0.0);
        assert!(json["lines"][1]["used"].is_null());
        assert_eq!(json["lines"][2]["availability"], "unsupported");
    }

    #[test]
    fn load_cache_migrates_v1_snapshot_without_history() {
        let dir = temp_dir("cache-v1-migration");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join(CACHE_FILE_NAME),
            r#"{"version":1,"snapshots":{"claude":{"providerId":"claude","displayName":"Claude","plan":"Pro","lines":[],"fetchedAt":"2026-03-26T08:15:30Z"}}}"#,
        )
        .unwrap();

        let loaded = load_cache(&dir);

        assert_eq!(loaded.len(), 1);
        assert!(loaded["claude"].history.is_none());

        let _ = std::fs::remove_dir_all(&dir);
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
