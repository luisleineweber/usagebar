use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use tauri::Emitter;
use uuid::Uuid;

use crate::AppState;
use crate::local_http_api;
use crate::plugin_engine;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeBatchComplete {
    pub batch_id: String,
}

#[tauri::command]
pub(crate) async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };
    let selected_plugins: Vec<_> = selected_plugins
        .into_iter()
        .filter(|plugin| crate::plugin_is_probe_supported(&plugin.manifest))
        .collect();

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let coordinator = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        Arc::clone(&locked.probe_coordinator)
    };
    let providers_to_start = coordinator
        .lock()
        .map_err(|e| e.to_string())?
        .reserve_batch(batch_id.clone(), &response_plugin_ids)?;
    let providers_to_start: HashSet<String> = providers_to_start.into_iter().collect();

    for plugin in selected_plugins
        .into_iter()
        .filter(|plugin| providers_to_start.contains(&plugin.manifest.id))
    {
        let handle = app_handle.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let coordinator = Arc::clone(&coordinator);

        tauri::async_runtime::spawn_blocking(move || {
            let plugin_id = plugin.manifest.id.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                plugin_engine::runtime::run_probe(&plugin, &data_dir, &version, Some(&handle))
            }));

            let output = match result {
                Ok(output) => {
                    let has_error = output.lines.iter().any(|line| {
                        matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                    });
                    if has_error {
                        log::warn!("probe {} completed with error", plugin_id);
                    } else {
                        log::info!(
                            "probe {} completed ok ({} lines)",
                            plugin_id,
                            output.lines.len()
                        );
                        local_http_api::cache_successful_output(&output);
                    }
                    output
                }
                Err(_) => {
                    log::error!("probe {} panicked", plugin_id);
                    plugin_engine::runtime::error_output(
                        &plugin,
                        "provider probe panicked".to_string(),
                    )
                }
            };

            let completion = coordinator
                .lock()
                .expect("probe coordinator lock poisoned")
                .complete_provider(&plugin_id);
            for result_batch_id in &completion.result_batch_ids {
                let _ = handle.emit(
                    "probe:result",
                    ProbeResult {
                        batch_id: result_batch_id.clone(),
                        output: output.clone(),
                    },
                );
            }
            for completed_batch_id in completion.completed_batch_ids {
                log::info!("probe batch {} complete", completed_batch_id);
                let _ = handle.emit(
                    "probe:batch-complete",
                    ProbeBatchComplete {
                        batch_id: completed_batch_id,
                    },
                );
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}
