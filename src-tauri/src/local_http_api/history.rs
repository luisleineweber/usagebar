use super::cache::CachedPluginSnapshot;
use crate::plugin_engine::freshness::DataFreshnessGroups;
use crate::plugin_engine::runtime::UsageHistoryEntry;
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HistoryGroupBy {
    #[default]
    Day,
    Provider,
    Model,
    Project,
}

impl HistoryGroupBy {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "day" => Some(Self::Day),
            "provider" => Some(Self::Provider),
            "model" => Some(Self::Model),
            "project" => Some(Self::Project),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct HistoryQuery {
    provider_ids: Vec<String>,
    from: Option<OffsetDateTime>,
    to: Option<OffsetDateTime>,
    model: Option<String>,
    project: Option<String>,
    group_by: HistoryGroupBy,
}

impl HistoryQuery {
    pub fn set_provider_ids(&mut self, provider_ids: impl IntoIterator<Item = String>) {
        self.provider_ids = provider_ids.into_iter().collect();
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTotals {
    cost_usd: f64,
    requests: f64,
    input_tokens: f64,
    output_tokens: f64,
    cache_read_tokens: f64,
    cache_creation_tokens: f64,
    reasoning_tokens: f64,
    total_tokens: f64,
}

impl HistoryTotals {
    fn add(&mut self, entry: &UsageHistoryEntry) {
        self.cost_usd += entry.cost_usd.unwrap_or_default();
        self.requests += entry.requests.unwrap_or_default();
        self.input_tokens += entry.input_tokens.unwrap_or_default();
        self.output_tokens += entry.output_tokens.unwrap_or_default();
        self.cache_read_tokens += entry.cache_read_tokens.unwrap_or_default();
        self.cache_creation_tokens += entry.cache_creation_tokens.unwrap_or_default();
        self.reasoning_tokens += entry.reasoning_tokens.unwrap_or_default();
        self.total_tokens += entry.total_tokens.unwrap_or_else(|| {
            entry.input_tokens.unwrap_or_default()
                + entry.output_tokens.unwrap_or_default()
                + entry.cache_read_tokens.unwrap_or_default()
                + entry.cache_creation_tokens.unwrap_or_default()
                + entry.reasoning_tokens.unwrap_or_default()
        });
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryGroup {
    key: String,
    label: String,
    entry_count: usize,
    totals: HistoryTotals,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHistory {
    provider_id: String,
    display_name: String,
    source: String,
    time_zone: String,
    entries: Vec<UsageHistoryEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    freshness: Option<DataFreshnessGroups>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppliedHistoryFilters {
    providers: Vec<String>,
    from: Option<String>,
    to: Option<String>,
    model: Option<String>,
    project: Option<String>,
    group_by: HistoryGroupBy,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryResponse {
    schema_version: u32,
    generated_at: String,
    filters: AppliedHistoryFilters,
    totals: HistoryTotals,
    groups: Vec<HistoryGroup>,
    providers: Vec<ProviderHistory>,
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                    .map_err(|_| "query contains invalid percent encoding".to_string())?;
                let byte = u8::from_str_radix(hex, 16)
                    .map_err(|_| "query contains invalid percent encoding".to_string())?;
                out.push(byte);
                index += 3;
            }
            b'%' => return Err("query contains invalid percent encoding".to_string()),
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|_| "query must be valid UTF-8".to_string())
}

pub fn parse_history_query(query: Option<&str>) -> Result<HistoryQuery, String> {
    let mut parsed = HistoryQuery::default();
    let Some(query) = query.filter(|query| !query.is_empty()) else {
        return Ok(parsed);
    };

    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        let key = percent_decode(raw_key)?;
        let value = percent_decode(raw_value)?;
        match key.as_str() {
            "provider" => {
                parsed.provider_ids = value
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .collect();
            }
            "from" => {
                parsed.from = Some(
                    OffsetDateTime::parse(&value, &Rfc3339)
                        .map_err(|_| "from must be RFC3339".to_string())?,
                );
            }
            "to" => {
                parsed.to = Some(
                    OffsetDateTime::parse(&value, &Rfc3339)
                        .map_err(|_| "to must be RFC3339".to_string())?,
                );
            }
            "model" => parsed.model = non_empty(value),
            "project" => parsed.project = non_empty(value),
            "groupBy" => {
                parsed.group_by = HistoryGroupBy::parse(&value).ok_or_else(|| {
                    "groupBy must be day, provider, model, or project".to_string()
                })?;
            }
            _ => {}
        }
    }

    if matches!((parsed.from, parsed.to), (Some(from), Some(to)) if from >= to) {
        return Err("from must be before to".to_string());
    }

    Ok(parsed)
}

fn non_empty(value: String) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn matches_dimension(actual: Option<&str>, expected: Option<&str>) -> bool {
    expected
        .is_none_or(|expected| actual.is_some_and(|actual| actual.eq_ignore_ascii_case(expected)))
}

fn entry_matches(entry: &UsageHistoryEntry, query: &HistoryQuery) -> bool {
    let start = OffsetDateTime::parse(&entry.period_start, &Rfc3339).ok();
    let end = OffsetDateTime::parse(&entry.period_end, &Rfc3339).ok();
    if query
        .from
        .is_some_and(|from| end.is_none_or(|end| end <= from))
    {
        return false;
    }
    if query
        .to
        .is_some_and(|to| start.is_none_or(|start| start >= to))
    {
        return false;
    }
    matches_dimension(entry.model.as_deref(), query.model.as_deref())
        && matches_dimension(entry.project.as_deref(), query.project.as_deref())
}

fn group_key(
    group_by: HistoryGroupBy,
    provider_id: &str,
    entry: &UsageHistoryEntry,
) -> (String, String) {
    match group_by {
        HistoryGroupBy::Day => {
            let day = entry.period_start.get(..10).unwrap_or(&entry.period_start);
            (day.to_string(), day.to_string())
        }
        HistoryGroupBy::Provider => (provider_id.to_string(), provider_id.to_string()),
        HistoryGroupBy::Model => {
            let model = entry.model.as_deref().unwrap_or("Unspecified model");
            (model.to_string(), model.to_string())
        }
        HistoryGroupBy::Project => {
            let project = entry.project.as_deref().unwrap_or("Unspecified project");
            (project.to_string(), project.to_string())
        }
    }
}

pub fn build_history_response(
    snapshots: Vec<CachedPluginSnapshot>,
    query: &HistoryQuery,
) -> HistoryResponse {
    let provider_filter: HashSet<&str> = query.provider_ids.iter().map(String::as_str).collect();
    let mut totals = HistoryTotals::default();
    let mut grouped: BTreeMap<String, HistoryGroup> = BTreeMap::new();
    let mut providers = Vec::new();

    for snapshot in snapshots {
        if !provider_filter.is_empty() && !provider_filter.contains(snapshot.provider_id.as_str()) {
            continue;
        }
        let Some(history) = snapshot.history else {
            continue;
        };
        let entries: Vec<_> = history
            .entries
            .into_iter()
            .filter(|entry| entry_matches(entry, query))
            .collect();

        for entry in &entries {
            totals.add(entry);
            let (key, label) = group_key(query.group_by, &snapshot.provider_id, entry);
            let group = grouped.entry(key.clone()).or_insert_with(|| HistoryGroup {
                key,
                label,
                entry_count: 0,
                totals: HistoryTotals::default(),
            });
            group.entry_count += 1;
            group.totals.add(entry);
        }

        providers.push(ProviderHistory {
            provider_id: snapshot.provider_id,
            display_name: snapshot.display_name,
            source: history.source,
            time_zone: history.time_zone,
            entries,
            freshness: snapshot
                .freshness
                .as_ref()
                .map(|freshness| DataFreshnessGroups {
                    quota: None,
                    cost: None,
                    history: freshness.history.clone(),
                }),
        });
    }

    HistoryResponse {
        schema_version: 1,
        generated_at: OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_default(),
        filters: AppliedHistoryFilters {
            providers: query.provider_ids.clone(),
            from: query.from.and_then(|value| value.format(&Rfc3339).ok()),
            to: query.to.and_then(|value| value.format(&Rfc3339).ok()),
            model: query.model.clone(),
            project: query.project.clone(),
            group_by: query.group_by,
        },
        totals,
        groups: grouped.into_values().collect(),
        providers,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::runtime::UsageHistory;

    fn entry(day: &str, model: Option<&str>, project: Option<&str>) -> UsageHistoryEntry {
        UsageHistoryEntry {
            period_start: format!("{day}T00:00:00Z"),
            period_end: format!("{day}T23:59:59Z"),
            model: model.map(str::to_string),
            project: project.map(str::to_string),
            account: None,
            cost_usd: Some(1.5),
            requests: Some(2.0),
            input_tokens: Some(10.0),
            output_tokens: Some(5.0),
            cache_read_tokens: None,
            cache_creation_tokens: None,
            reasoning_tokens: None,
            total_tokens: Some(15.0),
        }
    }

    fn snapshot() -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            instance_ref: None,
            display_name: "Claude".to_string(),
            plan: None,
            lines: vec![],
            history: Some(UsageHistory {
                version: 1,
                source: "ccusage".to_string(),
                time_zone: "UTC".to_string(),
                entries: vec![
                    entry("2026-07-09", Some("sonnet"), Some("alpha")),
                    entry("2026-07-10", Some("opus"), Some("beta")),
                ],
            }),
            fetched_at: "2026-07-10T12:00:00Z".to_string(),
            freshness: None,
        }
    }

    #[test]
    fn query_parses_filters_and_encoded_values() {
        let query = parse_history_query(Some(
            "provider=claude,codex&model=claude%20sonnet&groupBy=model",
        ))
        .unwrap();
        assert_eq!(query.provider_ids, ["claude", "codex"]);
        assert_eq!(query.model.as_deref(), Some("claude sonnet"));
        assert_eq!(query.group_by, HistoryGroupBy::Model);
    }

    #[test]
    fn query_rejects_invalid_range() {
        let error = parse_history_query(Some(
            "from=2026-07-10T00%3A00%3A00Z&to=2026-07-09T00%3A00%3A00Z",
        ))
        .unwrap_err();
        assert_eq!(error, "from must be before to");
    }

    #[test]
    fn response_filters_and_groups_without_double_counting() {
        let query = parse_history_query(Some("project=beta&groupBy=model")).unwrap();
        let response = build_history_response(vec![snapshot()], &query);
        assert_eq!(response.providers[0].entries.len(), 1);
        assert_eq!(response.groups.len(), 1);
        assert_eq!(response.groups[0].key, "opus");
        assert_eq!(response.totals.cost_usd, 1.5);
        assert_eq!(response.totals.total_tokens, 15.0);
    }
}
