use crate::local_http_api::cache::CachedPluginSnapshot;
use crate::plugin_engine::runtime::{MetricLine, ProgressFormat, UsageHistoryEntry};
use serde::Serialize;
use time::{Duration, OffsetDateTime, format_description::well_known::Rfc3339};

const SCHEMA_VERSION: u32 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageResponse<'a> {
    schema_version: u32,
    command: &'static str,
    providers: Vec<UsageProvider<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageProvider<'a> {
    provider_id: &'a str,
    display_name: &'a str,
    plan: &'a Option<String>,
    lines: &'a [MetricLine],
    fetched_at: &'a str,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryTotals {
    cost_usd: f64,
    requests: f64,
    input_tokens: f64,
    output_tokens: f64,
    cache_read_tokens: f64,
    cache_creation_tokens: f64,
    reasoning_tokens: f64,
    total_tokens: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryProvider {
    provider_id: String,
    display_name: String,
    source: String,
    time_zone: String,
    totals: HistoryTotals,
    entries: Vec<UsageHistoryEntry>,
    fetched_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryResponse {
    schema_version: u32,
    command: &'static str,
    days: u16,
    from: String,
    to: String,
    totals: HistoryTotals,
    providers: Vec<HistoryProvider>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatuslineResponse {
    schema_version: u32,
    command: &'static str,
    text: String,
    providers: Vec<StatuslineProvider>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatuslineProvider {
    provider_id: String,
    display_name: String,
    text: String,
    fetched_at: String,
}

pub(crate) fn usage(snapshots: &[CachedPluginSnapshot], json: bool) -> Result<String, String> {
    if json {
        let providers = snapshots
            .iter()
            .map(|snapshot| UsageProvider {
                provider_id: &snapshot.provider_id,
                display_name: &snapshot.display_name,
                plan: &snapshot.plan,
                lines: &snapshot.lines,
                fetched_at: &snapshot.fetched_at,
            })
            .collect();
        return serde_json::to_string(&UsageResponse {
            schema_version: SCHEMA_VERSION,
            command: "usage",
            providers,
        })
        .map_err(|_| "could not serialize usage output".to_string());
    }

    Ok(snapshots
        .iter()
        .map(render_usage_provider)
        .collect::<Vec<_>>()
        .join("\n\n"))
}

fn render_usage_provider(snapshot: &CachedPluginSnapshot) -> String {
    let mut output = snapshot.display_name.clone();
    if let Some(plan) = snapshot
        .plan
        .as_deref()
        .filter(|plan| !plan.trim().is_empty())
    {
        output.push_str(&format!(" ({})", plan.trim()));
    }
    for line in &snapshot.lines {
        output.push_str("\n  ");
        output.push_str(&render_line(line));
    }
    output.push_str("\n  Fetched: ");
    output.push_str(&snapshot.fetched_at);
    output
}

fn render_line(line: &MetricLine) -> String {
    match line {
        MetricLine::Text { label, value, .. } => format!("{label}: {value}"),
        MetricLine::Badge { label, text, .. } => format!("{label}: {text}"),
        MetricLine::Progress {
            label,
            used,
            limit,
            format,
            resets_at,
            ..
        } => {
            let value = progress_value(*used, *limit, format);
            match resets_at {
                Some(reset) => format!("{label}: {value} (resets {reset})"),
                None => format!("{label}: {value}"),
            }
        }
    }
}

fn progress_value(used: f64, limit: f64, format: &ProgressFormat) -> String {
    match format {
        ProgressFormat::Percent => {
            let percent = if limit > 0.0 {
                used / limit * 100.0
            } else {
                0.0
            };
            format!("{}% used", number(percent))
        }
        ProgressFormat::Dollars => format!("${} / ${}", money(used), money(limit)),
        ProgressFormat::Count { suffix } => {
            format!("{} / {} {}", number(used), number(limit), suffix.trim())
        }
    }
}

pub(crate) fn history(
    snapshots: &[CachedPluginSnapshot],
    days: u16,
    now: OffsetDateTime,
    json: bool,
) -> Result<Option<String>, String> {
    let from = now - Duration::days(i64::from(days));
    let mut providers = Vec::new();
    let mut totals = HistoryTotals::default();
    for snapshot in snapshots {
        let Some(history) = &snapshot.history else {
            continue;
        };
        let mut entries: Vec<_> = history
            .entries
            .iter()
            .filter(|entry| entry_is_in_window(entry, from, now))
            .cloned()
            .collect();
        entries.sort_by(|left, right| {
            left.period_start
                .cmp(&right.period_start)
                .then_with(|| left.period_end.cmp(&right.period_end))
                .then_with(|| left.model.cmp(&right.model))
        });
        if entries.is_empty() {
            continue;
        }
        let provider_totals = totals_for(&entries);
        totals.add(&provider_totals);
        providers.push(HistoryProvider {
            provider_id: snapshot.provider_id.clone(),
            display_name: snapshot.display_name.clone(),
            source: history.source.clone(),
            time_zone: history.time_zone.clone(),
            totals: provider_totals,
            entries,
            fetched_at: snapshot.fetched_at.clone(),
        });
    }
    if providers.is_empty() {
        return Ok(None);
    }

    let from_text = from.format(&Rfc3339).unwrap_or_default();
    let to_text = now.format(&Rfc3339).unwrap_or_default();
    if json {
        return serde_json::to_string(&HistoryResponse {
            schema_version: SCHEMA_VERSION,
            command: "history",
            days,
            from: from_text,
            to: to_text,
            totals,
            providers,
        })
        .map(Some)
        .map_err(|_| "could not serialize history output".to_string());
    }

    let mut sections = Vec::new();
    for provider in providers {
        let mut section = format!("{} history ({} days)", provider.display_name, days);
        section.push_str("\n  Total: ");
        section.push_str(&history_metrics(&provider.totals));
        for entry in &provider.entries {
            section.push_str("\n  ");
            section.push_str(&entry.period_start);
            section.push_str(" -> ");
            section.push_str(&entry.period_end);
            section.push_str(" | ");
            section.push_str(&history_metrics(&totals_for(std::slice::from_ref(entry))));
            if let Some(model) = entry.model.as_deref() {
                section.push_str(" | ");
                section.push_str(model);
            }
        }
        sections.push(section);
    }
    Ok(Some(sections.join("\n\n")))
}

fn entry_is_in_window(entry: &UsageHistoryEntry, from: OffsetDateTime, to: OffsetDateTime) -> bool {
    let Ok(start) = OffsetDateTime::parse(&entry.period_start, &Rfc3339) else {
        return false;
    };
    let Ok(end) = OffsetDateTime::parse(&entry.period_end, &Rfc3339) else {
        return false;
    };
    end > from && start <= to
}

impl HistoryTotals {
    fn add_entry(&mut self, entry: &UsageHistoryEntry) {
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

    fn add(&mut self, other: &Self) {
        self.cost_usd += other.cost_usd;
        self.requests += other.requests;
        self.input_tokens += other.input_tokens;
        self.output_tokens += other.output_tokens;
        self.cache_read_tokens += other.cache_read_tokens;
        self.cache_creation_tokens += other.cache_creation_tokens;
        self.reasoning_tokens += other.reasoning_tokens;
        self.total_tokens += other.total_tokens;
    }
}

fn totals_for(entries: &[UsageHistoryEntry]) -> HistoryTotals {
    let mut totals = HistoryTotals::default();
    for entry in entries {
        totals.add_entry(entry);
    }
    totals
}

fn history_metrics(totals: &HistoryTotals) -> String {
    let mut parts = Vec::new();
    if totals.cost_usd > 0.0 {
        parts.push(format!("${}", money(totals.cost_usd)));
    }
    if totals.total_tokens > 0.0 {
        parts.push(format!("{} tokens", number(totals.total_tokens)));
    }
    if totals.requests > 0.0 {
        parts.push(format!("{} requests", number(totals.requests)));
    }
    if parts.is_empty() {
        "0 usage".to_string()
    } else {
        parts.join(" | ")
    }
}

pub(crate) fn statusline(snapshots: &[CachedPluginSnapshot], json: bool) -> Result<String, String> {
    let providers: Vec<_> = snapshots
        .iter()
        .map(|snapshot| {
            let text = statusline_provider(snapshot);
            StatuslineProvider {
                provider_id: snapshot.provider_id.clone(),
                display_name: snapshot.display_name.clone(),
                text,
                fetched_at: snapshot.fetched_at.clone(),
            }
        })
        .collect();
    let text = providers
        .iter()
        .map(|provider| provider.text.as_str())
        .collect::<Vec<_>>()
        .join(" | ");
    if json {
        serde_json::to_string(&StatuslineResponse {
            schema_version: SCHEMA_VERSION,
            command: "statusline",
            text,
            providers,
        })
        .map_err(|_| "could not serialize status-line output".to_string())
    } else {
        Ok(text)
    }
}

fn statusline_provider(snapshot: &CachedPluginSnapshot) -> String {
    let value = snapshot
        .lines
        .iter()
        .find_map(|line| match line {
            MetricLine::Progress {
                label,
                used,
                limit,
                format,
                ..
            } => Some(format!(
                "{} {}",
                compact(label),
                compact(&progress_value(*used, *limit, format))
            )),
            _ => None,
        })
        .or_else(|| snapshot.plan.as_deref().map(compact))
        .or_else(|| {
            snapshot.lines.iter().find_map(|line| match line {
                MetricLine::Text { label, value, .. } => {
                    Some(format!("{} {}", compact(label), compact(value)))
                }
                MetricLine::Badge { label, text, .. } => {
                    Some(format!("{} {}", compact(label), compact(text)))
                }
                MetricLine::Progress { .. } => None,
            })
        })
        .unwrap_or_else(|| "cached".to_string());
    format!("{} {}", compact(&snapshot.display_name), value)
}

fn compact(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .replace('|', "/")
}

fn money(value: f64) -> String {
    format!("{value:.2}")
}

fn number(value: f64) -> String {
    if value.fract().abs() < f64::EPSILON {
        format!("{value:.0}")
    } else {
        let value = format!("{value:.2}");
        value
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::runtime::{ProgressFormat, UsageHistory};

    fn snapshot() -> CachedPluginSnapshot {
        CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            display_name: "Claude".to_string(),
            plan: Some("Pro".to_string()),
            lines: vec![
                MetricLine::Progress {
                    label: "Session".to_string(),
                    used: 42.0,
                    limit: 100.0,
                    format: ProgressFormat::Percent,
                    resets_at: Some("2026-07-11T00:00:00Z".to_string()),
                    period_duration_ms: None,
                    color: None,
                },
                MetricLine::Text {
                    label: "Today".to_string(),
                    value: "$1.25".to_string(),
                    color: None,
                    subtitle: None,
                },
            ],
            history: Some(UsageHistory {
                version: 1,
                source: "ccusage".to_string(),
                time_zone: "UTC".to_string(),
                entries: vec![UsageHistoryEntry {
                    period_start: "2026-07-09T00:00:00Z".to_string(),
                    period_end: "2026-07-10T00:00:00Z".to_string(),
                    model: Some("sonnet".to_string()),
                    project: None,
                    account: None,
                    cost_usd: Some(1.25),
                    requests: Some(2.0),
                    input_tokens: Some(10.0),
                    output_tokens: Some(5.0),
                    cache_read_tokens: None,
                    cache_creation_tokens: None,
                    reasoning_tokens: None,
                    total_tokens: Some(15.0),
                }],
            }),
            fetched_at: "2026-07-10T12:00:00Z".to_string(),
        }
    }

    #[test]
    fn usage_text_matches_golden_output() {
        assert_eq!(
            usage(&[snapshot()], false).unwrap(),
            "Claude (Pro)\n  Session: 42% used (resets 2026-07-11T00:00:00Z)\n  Today: $1.25\n  Fetched: 2026-07-10T12:00:00Z"
        );
    }

    #[test]
    fn usage_json_has_stable_schema_and_omits_history() {
        assert_eq!(
            usage(&[snapshot()], true).unwrap(),
            r#"{"schemaVersion":1,"command":"usage","providers":[{"providerId":"claude","displayName":"Claude","plan":"Pro","lines":[{"type":"progress","label":"Session","used":42.0,"limit":100.0,"format":{"kind":"percent"},"resetsAt":"2026-07-11T00:00:00Z","periodDurationMs":null,"color":null},{"type":"text","label":"Today","value":"$1.25","color":null,"subtitle":null}],"fetchedAt":"2026-07-10T12:00:00Z"}]}"#
        );
    }

    #[test]
    fn history_text_matches_golden_output() {
        let now = OffsetDateTime::parse("2026-07-10T12:00:00Z", &Rfc3339).unwrap();
        assert_eq!(
            history(&[snapshot()], 7, now, false).unwrap().unwrap(),
            "Claude history (7 days)\n  Total: $1.25 | 15 tokens | 2 requests\n  2026-07-09T00:00:00Z -> 2026-07-10T00:00:00Z | $1.25 | 15 tokens | 2 requests | sonnet"
        );
    }

    #[test]
    fn history_json_has_stable_schema() {
        let now = OffsetDateTime::parse("2026-07-10T12:00:00Z", &Rfc3339).unwrap();
        let output = history(&[snapshot()], 7, now, true).unwrap().unwrap();
        let value: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(value["schemaVersion"], 1);
        assert_eq!(value["command"], "history");
        assert_eq!(value["days"], 7);
        assert_eq!(value["providers"][0]["entries"][0]["totalTokens"], 15.0);
    }

    #[test]
    fn statusline_is_exactly_one_sanitized_line() {
        let mut snapshot = snapshot();
        snapshot.display_name = "Claude\nWork | Team".to_string();
        assert_eq!(
            statusline(&[snapshot], false).unwrap(),
            "Claude Work / Team Session 42% used"
        );
    }
}
