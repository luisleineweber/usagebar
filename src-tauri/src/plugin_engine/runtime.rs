use crate::plugin_engine::freshness::DataFreshnessGroups;
use crate::plugin_engine::host_api;
use crate::plugin_engine::manifest::LoadedPlugin;
use crate::plugin_engine::probe_error::{
    ProbeError, ProbeErrorCategory, classify_legacy_probe_error,
};
use rquickjs::{Array, Context, Ctx, Error, Object, Promise, Runtime, Value};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[cfg(not(test))]
type RuntimeAppHandle = tauri::AppHandle;
#[cfg(test)]
type RuntimeAppHandle = ();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProgressFormat {
    Percent,
    Dollars,
    Count { suffix: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MetricLine {
    Text {
        label: String,
        value: String,
        color: Option<String>,
        subtitle: Option<String>,
    },
    Progress {
        label: String,
        used: f64,
        limit: f64,
        format: ProgressFormat,
        #[serde(rename = "resetsAt")]
        resets_at: Option<String>,
        #[serde(rename = "periodDurationMs")]
        period_duration_ms: Option<u64>,
        color: Option<String>,
    },
    Badge {
        label: String,
        text: String,
        color: Option<String>,
        subtitle: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInstanceRef {
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginOutput {
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_ref: Option<ProviderInstanceRef>,
    pub display_name: String,
    pub plan: Option<String>,
    pub lines: Vec<MetricLine>,
    pub icon_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ProbeError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<UsageHistory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub freshness: Option<DataFreshnessGroups>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistory {
    pub version: u32,
    pub source: String,
    pub time_zone: String,
    pub entries: Vec<UsageHistoryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistoryEntry {
    pub period_start: String,
    pub period_end: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<f64>,
}

#[cfg(test)]
pub fn run_probe(
    plugin: &LoadedPlugin,
    app_data_dir: &Path,
    app_version: &str,
    app_handle: Option<&RuntimeAppHandle>,
) -> PluginOutput {
    run_probe_unstamped(plugin, app_data_dir, app_version, app_handle, None)
}

pub fn run_probe_for_instance(
    plugin: &LoadedPlugin,
    app_data_dir: &Path,
    app_version: &str,
    app_handle: Option<&RuntimeAppHandle>,
    instance_ref: &ProviderInstanceRef,
) -> PluginOutput {
    let mut output = run_probe_unstamped(
        plugin,
        app_data_dir,
        app_version,
        app_handle,
        Some(instance_ref),
    );
    output.instance_ref = Some(instance_ref.clone());
    output
}

fn run_probe_unstamped(
    plugin: &LoadedPlugin,
    app_data_dir: &Path,
    app_version: &str,
    app_handle: Option<&RuntimeAppHandle>,
    instance_ref: Option<&ProviderInstanceRef>,
) -> PluginOutput {
    let fallback = error_output(plugin, "runtime error".to_string());

    let rt = match Runtime::new() {
        Ok(rt) => rt,
        Err(_) => return fallback,
    };

    let ctx = match Context::full(&rt) {
        Ok(ctx) => ctx,
        Err(_) => return fallback,
    };

    let plugin_id = plugin.manifest.id.clone();
    let display_name = plugin.manifest.name.clone();
    let entry_script = plugin.entry_script.clone();
    let icon_url = plugin.icon_data_url.clone();
    let app_data = app_data_dir.to_path_buf();

    ctx.with(|ctx| {
        if host_api::inject_host_api_with_instance(
            &ctx,
            &plugin_id,
            &app_data,
            app_version,
            app_handle.cloned(),
            &plugin.manifest.capabilities,
            instance_ref.cloned(),
        )
        .is_err()
        {
            return error_output(plugin, "host api injection failed".to_string());
        }
        if host_api::patch_http_wrapper(&ctx).is_err() {
            return error_output(plugin, "http wrapper patch failed".to_string());
        }
        if host_api::patch_browser_wrapper(&ctx).is_err() {
            return error_output(plugin, "browser wrapper patch failed".to_string());
        }
        if host_api::patch_ls_wrapper(&ctx).is_err() {
            return error_output(plugin, "ls wrapper patch failed".to_string());
        }
        if host_api::patch_ccusage_wrapper(&ctx).is_err() {
            return error_output(plugin, "ccusage wrapper patch failed".to_string());
        }
        if host_api::inject_utils(&ctx).is_err() {
            return error_output(plugin, "utils injection failed".to_string());
        }

        if ctx.eval::<(), _>(entry_script.as_bytes()).is_err() {
            return error_output(plugin, "script eval failed".to_string());
        }

        let globals = ctx.globals();
        let plugin_obj: Object = match globals.get("__openusage_plugin") {
            Ok(obj) => obj,
            Err(_) => return error_output(plugin, "missing __openusage_plugin".to_string()),
        };

        let probe_fn: rquickjs::Function = match plugin_obj.get("probe") {
            Ok(f) => f,
            Err(_) => return error_output(plugin, "missing probe()".to_string()),
        };

        let probe_ctx: Value = globals
            .get("__openusage_ctx")
            .unwrap_or_else(|_| Value::new_undefined(ctx.clone()));

        let result_value: Value = match probe_fn.call((probe_ctx,)) {
            Ok(r) => r,
            Err(_) => return probe_error_output(plugin, extract_probe_error(&ctx)),
        };
        let result: Object = if result_value.is_promise() {
            let promise: Promise = match result_value.into_promise() {
                Some(promise) => promise,
                None => {
                    return error_output(plugin, "probe() returned invalid promise".to_string());
                }
            };
            match promise.finish::<Object>() {
                Ok(obj) => obj,
                Err(Error::WouldBlock) => {
                    return error_output(plugin, "probe() returned unresolved promise".to_string());
                }
                Err(_) => return probe_error_output(plugin, extract_probe_error(&ctx)),
            }
        } else {
            match result_value.into_object() {
                Some(obj) => obj,
                None => return error_output(plugin, "probe() returned non-object".to_string()),
            }
        };

        let plan: Option<String> = result
            .get::<_, String>("plan")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| plugin.manifest.default_plan.clone());

        let lines = match parse_lines(&result) {
            Ok(lines) if !lines.is_empty() => lines,
            Ok(_) => vec![error_line("no lines returned".to_string())],
            Err(msg) => vec![error_line(msg)],
        };
        let history = parse_history(&result);

        let error = lines.iter().find_map(|line| match line {
            MetricLine::Badge { label, text, .. } if label == "Error" => Some(ProbeError {
                category: classify_legacy_probe_error(text),
                message: text.clone(),
            }),
            _ => None,
        });

        PluginOutput {
            provider_id: plugin_id,
            instance_ref: None,
            display_name,
            plan,
            lines,
            icon_url,
            error,
            history,
            freshness: None,
        }
    })
}

/// Parses optional provider activity history without making the probe fail.
///
/// The envelope is all-or-nothing: malformed version/source/timeZone/entries
/// omits the complete history value. Entries are isolated from one another:
/// malformed entries are logged and omitted while valid siblings are retained.
fn parse_history(result: &Object<'_>) -> Option<UsageHistory> {
    let history_value: Value = match result.get("history") {
        Ok(value) => value,
        Err(_) => return None,
    };
    if history_value.is_null() || history_value.is_undefined() {
        return None;
    }

    let Some(history) = history_value.into_object() else {
        log::warn!("plugin history must be an object; omitting history");
        return None;
    };

    let version = match required_number(&history, "version") {
        Ok(1.0) => 1,
        Ok(version) => {
            log::warn!(
                "plugin history version must be 1 (got {}); omitting history",
                version
            );
            return None;
        }
        Err(message) => {
            log::warn!("{}; omitting history", message);
            return None;
        }
    };
    let source = match required_non_empty_string(&history, "source") {
        Ok(source) => source,
        Err(message) => {
            log::warn!("{}; omitting history", message);
            return None;
        }
    };
    let time_zone = match required_non_empty_string(&history, "timeZone") {
        Ok(time_zone) => time_zone,
        Err(message) => {
            log::warn!("{}; omitting history", message);
            return None;
        }
    };
    let entries: Array = match history.get("entries") {
        Ok(entries) => entries,
        Err(_) => {
            log::warn!("plugin history entries must be an array; omitting history");
            return None;
        }
    };

    let mut parsed_entries = Vec::new();
    for index in 0..entries.len() {
        let entry: Object = match entries.get(index) {
            Ok(entry) => entry,
            Err(_) => {
                log::warn!(
                    "plugin history entry {} must be an object; omitting entry",
                    index
                );
                continue;
            }
        };
        match parse_history_entry(&entry) {
            Ok(entry) => parsed_entries.push(entry),
            Err(message) => log::warn!(
                "invalid plugin history entry {}: {}; omitting entry",
                index,
                message
            ),
        }
    }

    Some(UsageHistory {
        version,
        source,
        time_zone,
        entries: parsed_entries,
    })
}

fn parse_history_entry(entry: &Object<'_>) -> Result<UsageHistoryEntry, String> {
    let period_start = required_non_empty_string(entry, "periodStart")?;
    let period_end = required_non_empty_string(entry, "periodEnd")?;
    let parsed_start = parse_rfc3339(&period_start, "periodStart")?;
    let parsed_end = parse_rfc3339(&period_end, "periodEnd")?;
    if parsed_start >= parsed_end {
        return Err("periodStart must be before periodEnd".to_string());
    }

    let model = optional_non_empty_string(entry, "model")?;
    let project = optional_non_empty_string(entry, "project")?;
    let account = optional_non_empty_string(entry, "account")?;
    let cost_usd = optional_non_negative_number(entry, "costUsd")?;
    let requests = optional_non_negative_number(entry, "requests")?;
    let input_tokens = optional_non_negative_number(entry, "inputTokens")?;
    let output_tokens = optional_non_negative_number(entry, "outputTokens")?;
    let cache_read_tokens = optional_non_negative_number(entry, "cacheReadTokens")?;
    let cache_creation_tokens = optional_non_negative_number(entry, "cacheCreationTokens")?;
    let reasoning_tokens = optional_non_negative_number(entry, "reasoningTokens")?;
    let total_tokens = optional_non_negative_number(entry, "totalTokens")?;

    if cost_usd.is_none()
        && requests.is_none()
        && input_tokens.is_none()
        && output_tokens.is_none()
        && cache_read_tokens.is_none()
        && cache_creation_tokens.is_none()
        && reasoning_tokens.is_none()
        && total_tokens.is_none()
    {
        return Err("at least one usage metric is required".to_string());
    }

    Ok(UsageHistoryEntry {
        period_start,
        period_end,
        model,
        project,
        account,
        cost_usd,
        requests,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        reasoning_tokens,
        total_tokens,
    })
}

fn required_non_empty_string(object: &Object<'_>, field: &str) -> Result<String, String> {
    let value: Value = object
        .get(field)
        .map_err(|_| format!("history {} must be a non-empty string", field))?;
    let Some(value) = value.as_string() else {
        return Err(format!("history {} must be a non-empty string", field));
    };
    let value = value.to_string().unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Err(format!("history {} must be a non-empty string", field));
    }
    Ok(value)
}

fn optional_non_empty_string(object: &Object<'_>, field: &str) -> Result<Option<String>, String> {
    let value: Value = match object.get(field) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if value.is_null() || value.is_undefined() {
        return Ok(None);
    }
    let Some(value) = value.as_string() else {
        return Err(format!("{} must be a non-empty string when present", field));
    };
    let value = value.to_string().unwrap_or_default().trim().to_string();
    if value.is_empty() {
        return Err(format!("{} must be a non-empty string when present", field));
    }
    Ok(Some(value))
}

fn required_number(object: &Object<'_>, field: &str) -> Result<f64, String> {
    let value: Value = object
        .get(field)
        .map_err(|_| format!("history {} must be a finite number", field))?;
    let Some(value) = value.as_number() else {
        return Err(format!("history {} must be a finite number", field));
    };
    if !value.is_finite() {
        return Err(format!("history {} must be a finite number", field));
    }
    Ok(value)
}

fn optional_non_negative_number(object: &Object<'_>, field: &str) -> Result<Option<f64>, String> {
    let value: Value = match object.get(field) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if value.is_null() || value.is_undefined() {
        return Ok(None);
    }
    let Some(value) = value.as_number() else {
        return Err(format!("{} must be a finite non-negative number", field));
    };
    if !value.is_finite() || value < 0.0 {
        return Err(format!("{} must be a finite non-negative number", field));
    }
    Ok(Some(value))
}

fn parse_rfc3339(value: &str, field: &str) -> Result<time::OffsetDateTime, String> {
    time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .map_err(|_| format!("{} must be an RFC3339 timestamp", field))
}

fn parse_lines(result: &Object) -> Result<Vec<MetricLine>, String> {
    let lines: Array = result
        .get("lines")
        .map_err(|_| "missing lines".to_string())?;

    let mut out = Vec::new();
    let len = lines.len();
    for idx in 0..len {
        let line: Object = lines
            .get(idx)
            .map_err(|_| format!("invalid line at index {}", idx))?;

        let line_type: String = line.get("type").unwrap_or_default();
        let label = line.get::<_, String>("label").unwrap_or_default();
        let color = line.get::<_, String>("color").ok();
        let subtitle = line.get::<_, String>("subtitle").ok();

        match line_type.as_str() {
            "text" => {
                let value = line.get::<_, String>("value").unwrap_or_default();
                out.push(MetricLine::Text {
                    label,
                    value,
                    color,
                    subtitle,
                });
            }
            "progress" => {
                let used_value: Value = match line.get("used") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing used",
                            idx
                        )));
                        continue;
                    }
                };
                let used = match used_value.as_number() {
                    Some(n) => n,
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid used (expected number)",
                            idx
                        )));
                        continue;
                    }
                };

                let limit_value: Value = match line.get("limit") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing limit",
                            idx
                        )));
                        continue;
                    }
                };
                let limit = match limit_value.as_number() {
                    Some(n) => n,
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid limit (expected number)",
                            idx
                        )));
                        continue;
                    }
                };

                if !used.is_finite() || used < 0.0 {
                    out.push(error_line(format!(
                        "progress line at index {} invalid used: {}",
                        idx, used
                    )));
                    continue;
                }
                if !limit.is_finite() || limit <= 0.0 {
                    out.push(error_line(format!(
                        "progress line at index {} invalid limit: {}",
                        idx, limit
                    )));
                    continue;
                }

                let format_obj: Object = match line.get("format") {
                    Ok(obj) => obj,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing format",
                            idx
                        )));
                        continue;
                    }
                };
                let kind_value: Value = match format_obj.get("kind") {
                    Ok(v) => v,
                    Err(_) => {
                        out.push(error_line(format!(
                            "progress line at index {} missing format.kind",
                            idx
                        )));
                        continue;
                    }
                };
                let kind = match kind_value.as_string() {
                    Some(s) => s.to_string().unwrap_or_default(),
                    None => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid format.kind (expected string)",
                            idx
                        )));
                        continue;
                    }
                };
                let format = match kind.as_str() {
                    "percent" => {
                        if limit != 100.0 {
                            out.push(error_line(format!(
                                "progress line at index {}: percent format requires limit=100 (got {})",
                                idx, limit
                            )));
                            continue;
                        }
                        ProgressFormat::Percent
                    }
                    "dollars" => ProgressFormat::Dollars,
                    "count" => {
                        let suffix_value: Value = match format_obj.get("suffix") {
                            Ok(v) => v,
                            Err(_) => {
                                out.push(error_line(format!(
                                    "progress line at index {}: count format missing suffix",
                                    idx
                                )));
                                continue;
                            }
                        };
                        let suffix = match suffix_value.as_string() {
                            Some(s) => s.to_string().unwrap_or_default(),
                            None => {
                                out.push(error_line(format!(
                                    "progress line at index {}: count format suffix must be a string",
                                    idx
                                )));
                                continue;
                            }
                        };
                        let suffix = suffix.trim().to_string();
                        if suffix.is_empty() {
                            out.push(error_line(format!(
                                "progress line at index {}: count format suffix must be non-empty",
                                idx
                            )));
                            continue;
                        }
                        ProgressFormat::Count { suffix }
                    }
                    _ => {
                        out.push(error_line(format!(
                            "progress line at index {} invalid format.kind: {}",
                            idx, kind
                        )));
                        continue;
                    }
                };

                let resets_at = match line.get::<_, Value>("resetsAt") {
                    Ok(v) => {
                        if v.is_null() || v.is_undefined() {
                            None
                        } else if let Some(s) = v.as_string() {
                            let raw = s.to_string().unwrap_or_default();
                            let value = raw.trim().to_string();
                            if value.is_empty() {
                                None
                            } else {
                                let parsed = time::OffsetDateTime::parse(
                                    &value,
                                    &time::format_description::well_known::Rfc3339,
                                );
                                if parsed.is_ok() {
                                    Some(value)
                                } else {
                                    // ISO-like but missing timezone: assume UTC.
                                    let is_missing_tz =
                                        value.contains('T') && !value.ends_with('Z') && {
                                            let tail = value
                                                .split_once('T')
                                                .map(|(_, tail)| tail)
                                                .unwrap_or("");
                                            !tail.contains('+') && !tail.contains('-')
                                        };
                                    if is_missing_tz {
                                        let with_z = format!("{}Z", value);
                                        let parsed_with_z = time::OffsetDateTime::parse(
                                            &with_z,
                                            &time::format_description::well_known::Rfc3339,
                                        );
                                        if parsed_with_z.is_ok() {
                                            Some(with_z)
                                        } else {
                                            log::warn!(
                                                "invalid resetsAt at index {} (value='{}'), omitting",
                                                idx,
                                                raw
                                            );
                                            None
                                        }
                                    } else {
                                        log::warn!(
                                            "invalid resetsAt at index {} (value='{}'), omitting",
                                            idx,
                                            raw
                                        );
                                        None
                                    }
                                }
                            }
                        } else {
                            log::warn!("invalid resetsAt at index {} (non-string), omitting", idx);
                            None
                        }
                    }
                    Err(_) => None,
                };

                // Parse optional periodDurationMs
                let period_duration_ms: Option<u64> = match line.get::<_, Value>("periodDurationMs")
                {
                    Ok(val) => {
                        if val.is_null() || val.is_undefined() {
                            None
                        } else if let Some(n) = val.as_number() {
                            let ms = n as u64;
                            if ms > 0 {
                                Some(ms)
                            } else {
                                log::warn!(
                                    "periodDurationMs at index {} must be positive, omitting",
                                    idx
                                );
                                None
                            }
                        } else {
                            log::warn!(
                                "invalid periodDurationMs at index {} (non-number), omitting",
                                idx
                            );
                            None
                        }
                    }
                    Err(_) => None,
                };

                out.push(MetricLine::Progress {
                    label,
                    used,
                    limit,
                    format,
                    resets_at,
                    period_duration_ms,
                    color,
                });
            }
            "badge" => {
                let text = line.get::<_, String>("text").unwrap_or_default();
                out.push(MetricLine::Badge {
                    label,
                    text,
                    color,
                    subtitle,
                });
            }
            _ => {
                out.push(error_line(format!(
                    "unknown line type at index {}: {}",
                    idx, line_type
                )));
            }
        }
    }

    Ok(out)
}

pub(crate) fn error_output(plugin: &LoadedPlugin, message: String) -> PluginOutput {
    let error = ProbeError {
        category: classify_legacy_probe_error(&message),
        message: message.clone(),
    };
    probe_error_output(plugin, error)
}

fn probe_error_output(plugin: &LoadedPlugin, error: ProbeError) -> PluginOutput {
    PluginOutput {
        provider_id: plugin.manifest.id.clone(),
        instance_ref: None,
        display_name: plugin.manifest.name.clone(),
        plan: plugin.manifest.default_plan.clone(),
        lines: vec![error_line(error.message.clone())],
        icon_url: plugin.icon_data_url.clone(),
        error: Some(error),
        history: None,
        freshness: None,
    }
}

fn extract_probe_error(ctx: &Ctx<'_>) -> ProbeError {
    let exc = ctx.catch();
    if exc.is_null() || exc.is_undefined() {
        return ProbeError {
            category: ProbeErrorCategory::Unknown,
            message: "The plugin failed, try again or contact plugin author.".to_string(),
        };
    }
    if let Some(object) = exc.as_object() {
        let message = object
            .get::<_, String>("message")
            .ok()
            .filter(|message| !message.trim().is_empty());
        let category = object
            .get::<_, String>("category")
            .ok()
            .and_then(|value| ProbeErrorCategory::from_wire_name(&value));
        if let Some(message) = message {
            return ProbeError {
                category: category.unwrap_or_else(|| classify_legacy_probe_error(&message)),
                message,
            };
        }
    }
    if let Some(str_val) = exc.as_string() {
        let message: String = str_val.to_string().unwrap_or_default();
        let trimmed = message.trim();
        if !trimmed.is_empty() {
            return ProbeError {
                category: classify_legacy_probe_error(trimmed),
                message: trimmed.to_string(),
            };
        }
    }
    ProbeError {
        category: ProbeErrorCategory::Unknown,
        message: "The plugin failed, try again or contact plugin author.".to_string(),
    }
}

fn error_line(message: String) -> MetricLine {
    MetricLine::Badge {
        label: "Error".to_string(),
        text: message,
        color: Some("#ef4444".to_string()),
        subtitle: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin_engine::manifest::{
        HostCapabilities, LoadedPlugin, PlatformSupport, PluginManifest,
    };
    use serde_json::Value as JsonValue;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_plugin(entry_script: &str) -> LoadedPlugin {
        LoadedPlugin {
            manifest: PluginManifest {
                schema_version: 1,
                id: "test".to_string(),
                name: "Test".to_string(),
                version: "0.0.0".to_string(),
                entry: "plugin.js".to_string(),
                icon: "icon.svg".to_string(),
                dark_icon: None,
                icon_color_mode: crate::plugin_engine::manifest::IconColorMode::default(),
                brand_color: None,
                default_plan: None,
                lines: vec![],
                links: vec![],
                status: None,
                platform_support: PlatformSupport::default(),
                capabilities: HostCapabilities::default(),
                source_provenance: None,
            },
            plugin_dir: PathBuf::from("."),
            entry_script: entry_script.to_string(),
            icon_data_url: "data:image/svg+xml;base64,".to_string(),
            dark_icon_data_url: None,
        }
    }

    fn temp_app_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("openusage-test-{}-{}", label, nanos))
    }

    fn error_text(output: PluginOutput) -> String {
        match output.lines.first() {
            Some(MetricLine::Badge { text, .. }) => text.clone(),
            other => panic!("expected error badge, got {:?}", other),
        }
    }

    #[test]
    fn run_probe_returns_thrown_string_from_sync_error() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    throw "boom";
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("sync"), "0.0.0", None);
        assert_eq!(error_text(output), "boom");
    }

    #[test]
    fn run_probe_returns_thrown_string_from_async_error() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe: async function () {
                    throw "boom";
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("async"), "0.0.0", None);
        assert_eq!(error_text(output), "boom");
    }

    #[test]
    fn run_probe_preserves_structured_error_category() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    const error = new Error("Cursor auth state could not be read");
                    error.category = "credentialUnavailable";
                    throw error;
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("structured-error"), "0.0.0", None);
        let error = output.error.expect("structured probe error");
        assert_eq!(error.category, ProbeErrorCategory::CredentialUnavailable);
        assert_eq!(error.message, "Cursor auth state could not be read");
    }

    #[test]
    fn run_probe_preserves_unstructured_error_object_message() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    throw new Error("specific failure detail");
                }
            };
            "#,
        );
        let output = run_probe(&plugin, &temp_app_dir("object-error"), "0.0.0", None);
        let error = output.error.expect("probe error");
        assert_eq!(error.category, ProbeErrorCategory::Unknown);
        assert_eq!(error.message, "specific failure detail");
    }

    #[test]
    fn progress_resets_at_serializes_as_resets_at_camelcase() {
        let line = MetricLine::Progress {
            label: "Session".to_string(),
            used: 1.0,
            limit: 100.0,
            format: ProgressFormat::Percent,
            resets_at: Some("2099-01-01T00:00:00.000Z".to_string()),
            period_duration_ms: None,
            color: None,
        };

        let json: JsonValue = serde_json::to_value(&line).expect("serialize");
        let obj = json.as_object().expect("object");
        assert!(obj.get("resetsAt").is_some(), "expected resetsAt key");
        assert!(
            obj.get("resets_at").is_none(),
            "did not expect resets_at key"
        );
    }

    #[test]
    fn run_probe_for_instance_stamps_the_captured_provider_identity() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return { lines: [{ type: "text", label: "Status", value: "ok" }] };
                }
            };
            "#,
        );
        let instance_ref = ProviderInstanceRef {
            provider_id: "codex".to_string(),
            instance_id: Some("profile-a".to_string()),
        };

        let output = run_probe_for_instance(
            &plugin,
            &temp_app_dir("instance-ref"),
            "0.0.0",
            None,
            &instance_ref,
        );

        assert_eq!(output.instance_ref, Some(instance_ref));
    }

    #[test]
    fn run_probe_parses_and_serializes_normalized_usage_history() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return {
                        lines: [{ type: "text", label: "Today", value: "$1.25" }],
                        history: {
                            version: 1,
                            source: " ccusage ",
                            timeZone: " Europe/Berlin ",
                            entries: [{
                                periodStart: "2026-07-09T22:00:00Z",
                                periodEnd: "2026-07-10T22:00:00Z",
                                model: " claude-sonnet-4 ",
                                project: " usagebar ",
                                account: " work ",
                                costUsd: 1.25,
                                requests: 3,
                                inputTokens: 100,
                                outputTokens: 20,
                                cacheReadTokens: 30,
                                cacheCreationTokens: 10,
                                reasoningTokens: 5,
                                totalTokens: 160
                            }]
                        }
                    };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("valid-history"), "0.0.0", None);
        let history = output.history.as_ref().expect("history");
        assert_eq!(history.version, 1);
        assert_eq!(history.source, "ccusage");
        assert_eq!(history.time_zone, "Europe/Berlin");
        assert_eq!(history.entries.len(), 1);
        assert_eq!(history.entries[0].model.as_deref(), Some("claude-sonnet-4"));
        assert_eq!(history.entries[0].total_tokens, Some(160.0));

        let json: JsonValue = serde_json::to_value(output).expect("serialize");
        assert_eq!(json["history"]["timeZone"], "Europe/Berlin");
        assert_eq!(
            json["history"]["entries"][0]["periodStart"],
            "2026-07-09T22:00:00Z"
        );
        assert_eq!(json["history"]["entries"][0]["costUsd"], 1.25);
        assert!(json["history"]["entries"][0].get("cost_usd").is_none());
    }

    #[test]
    fn run_probe_uses_manifest_plan_only_when_plugin_does_not_report_one() {
        let mut plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return { lines: [{ type: "text", label: "Status", value: "ok" }] };
                }
            };
            "#,
        );
        plugin.manifest.default_plan = Some("Free".to_string());

        let output = run_probe(&plugin, &temp_app_dir("default-plan"), "0.0.0", None);
        assert_eq!(output.plan.as_deref(), Some("Free"));

        plugin.entry_script = r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return { plan: "Pro", lines: [{ type: "text", label: "Status", value: "ok" }] };
                }
            };
        "#
        .to_string();
        let output = run_probe(&plugin, &temp_app_dir("reported-plan"), "0.0.0", None);
        assert_eq!(output.plan.as_deref(), Some("Pro"));
    }

    #[test]
    fn run_probe_omits_invalid_history_envelopes_without_failing_lines() {
        let invalid_histories = [
            r#""not-an-object""#,
            r#"({ source: "ccusage", timeZone: "UTC", entries: [] })"#,
            r#"({ version: 2, source: "ccusage", timeZone: "UTC", entries: [] })"#,
            r#"({ version: 1, source: "", timeZone: "UTC", entries: [] })"#,
            r#"({ version: 1, source: "ccusage", timeZone: "", entries: [] })"#,
            r#"({ version: 1, source: "ccusage", timeZone: "UTC", entries: {} })"#,
        ];

        for (index, history) in invalid_histories.iter().enumerate() {
            let plugin = test_plugin(&format!(
                r#"
                globalThis.__openusage_plugin = {{
                    probe() {{
                        return {{
                            lines: [{{ type: "text", label: "Today", value: "$1.25" }}],
                            history: {history}
                        }};
                    }}
                }};
                "#
            ));

            let output = run_probe(
                &plugin,
                &temp_app_dir(&format!("invalid-envelope-{index}")),
                "0.0.0",
                None,
            );
            assert!(output.history.is_none(), "case {index} should omit history");
            assert!(matches!(
                output.lines.first(),
                Some(MetricLine::Text { .. })
            ));
        }
    }

    #[test]
    fn run_probe_omits_only_invalid_history_entries() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return {
                        lines: [{ type: "text", label: "Today", value: "$1.25" }],
                        history: {
                            version: 1,
                            source: "ccusage",
                            timeZone: "UTC",
                            entries: [
                                {
                                    periodStart: "2026-07-10T00:00:00Z",
                                    periodEnd: "2026-07-11T00:00:00Z",
                                    totalTokens: 42
                                },
                                "not-an-object",
                                {
                                    periodStart: "not-a-date",
                                    periodEnd: "2026-07-11T00:00:00Z",
                                    totalTokens: 1
                                },
                                {
                                    periodStart: "2026-07-11T00:00:00Z",
                                    periodEnd: "2026-07-10T00:00:00Z",
                                    totalTokens: 1
                                },
                                {
                                    periodStart: "2026-07-10T00:00:00Z",
                                    periodEnd: "2026-07-11T00:00:00Z",
                                    costUsd: -1
                                },
                                {
                                    periodStart: "2026-07-10T00:00:00Z",
                                    periodEnd: "2026-07-11T00:00:00Z",
                                    requests: Infinity
                                },
                                {
                                    periodStart: "2026-07-10T00:00:00Z",
                                    periodEnd: "2026-07-11T00:00:00Z",
                                    model: ""
                                },
                                {
                                    periodStart: "2026-07-10T00:00:00Z",
                                    periodEnd: "2026-07-11T00:00:00Z"
                                }
                            ]
                        }
                    };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("invalid-entries"), "0.0.0", None);
        let history = output.history.expect("valid envelope should remain");
        assert_eq!(history.entries.len(), 1);
        assert_eq!(history.entries[0].total_tokens, Some(42.0));
    }

    #[test]
    fn run_probe_omits_absent_history_from_serialized_output() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() {
                    return { lines: [{ type: "text", label: "Today", value: "$1.25" }] };
                }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("absent-history"), "0.0.0", None);
        assert!(output.history.is_none());
        let json: JsonValue = serde_json::to_value(output).expect("serialize");
        assert!(json.get("history").is_none());
    }

    #[test]
    fn error_outputs_never_include_history() {
        let plugin = test_plugin(
            r#"
            globalThis.__openusage_plugin = {
                probe() { throw "boom"; }
            };
            "#,
        );

        let output = run_probe(&plugin, &temp_app_dir("error-history"), "0.0.0", None);
        assert!(output.history.is_none());
    }
}
