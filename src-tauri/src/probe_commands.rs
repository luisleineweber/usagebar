use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};

use tauri::Emitter;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::AppState;
use crate::local_http_api;
use crate::plugin_engine;
use crate::plugin_engine::runtime::ProviderInstanceRef;

const MAX_CONCURRENT_PROBES: usize = 4;

fn probe_semaphore() -> &'static Arc<Semaphore> {
    static SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();
    SEMAPHORE.get_or_init(|| Arc::new(Semaphore::new(MAX_CONCURRENT_PROBES)))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
    pub instance_refs: Vec<ProviderInstanceRef>,
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
    instance_refs: Option<Vec<ProviderInstanceRef>>,
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
            instance_refs: Vec::new(),
        });
    }

    let coordinator = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        Arc::clone(&locked.probe_coordinator)
    };
    let instance_refs = resolve_instance_refs(&app_data_dir, &response_plugin_ids, instance_refs);
    let instances_to_start = coordinator
        .lock()
        .map_err(|e| e.to_string())?
        .reserve_batch(batch_id.clone(), &instance_refs)?;
    let instances_to_start: HashSet<ProviderInstanceRef> = instances_to_start.into_iter().collect();

    for plugin in selected_plugins.into_iter().filter(|plugin| {
        instance_refs
            .iter()
            .find(|instance| instance.provider_id == plugin.manifest.id)
            .is_some_and(|instance| instances_to_start.contains(instance))
    }) {
        let handle = app_handle.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let coordinator = Arc::clone(&coordinator);
        let semaphore = Arc::clone(probe_semaphore());
        let plugin_id = plugin.manifest.id.clone();
        let instance_ref = instance_refs
            .iter()
            .find(|instance| instance.provider_id == plugin_id)
            .cloned()
            .expect("every selected plugin has an instance ref");
        let worker_plugin_id = plugin_id.clone();
        let join_plugin_id = plugin_id.clone();
        let capacity_plugin_id = plugin_id.clone();
        let worker_plugin = plugin.clone();
        let worker_instance_ref = instance_ref.clone();
        let panic_plugin = plugin.clone();
        let join_plugin = plugin.clone();
        let capacity_plugin = plugin.clone();
        let worker_handle = handle.clone();

        tauri::async_runtime::spawn(async move {
            let mut output = match semaphore.acquire_owned().await {
                Ok(_permit) => {
                    match tauri::async_runtime::spawn_blocking(move || {
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            plugin_engine::runtime::run_probe_for_instance(
                                &worker_plugin,
                                &data_dir,
                                &version,
                                Some(&worker_handle),
                                &worker_instance_ref,
                            )
                        }));

                        match result {
                            Ok(output) => output,
                            Err(_) => {
                                log::error!("probe {} panicked", worker_plugin_id);
                                plugin_engine::runtime::error_output(
                                    &panic_plugin,
                                    "provider probe panicked".to_string(),
                                )
                            }
                        }
                    })
                    .await
                    {
                        Ok(output) => output,
                        Err(error) => {
                            log::error!("probe {} worker failed: {}", join_plugin_id, error);
                            plugin_engine::runtime::error_output(
                                &join_plugin,
                                "provider probe worker failed".to_string(),
                            )
                        }
                    }
                }
                Err(error) => {
                    log::error!(
                        "probe {} could not acquire worker slot: {}",
                        capacity_plugin_id,
                        error
                    );
                    plugin_engine::runtime::error_output(
                        &capacity_plugin,
                        "provider probe capacity unavailable".to_string(),
                    )
                }
            };

            let has_error = output.lines.iter().any(|line| {
                matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
            });
            output.instance_ref = Some(instance_ref.clone());
            if has_error {
                log::warn!("probe {} completed with error", plugin_id);
            } else {
                log::info!(
                    "probe {} completed ok ({} lines)",
                    plugin_id,
                    output.lines.len()
                );
                local_http_api::cache_successful_output(&mut output);
            }

            let completion = coordinator
                .lock()
                .expect("probe coordinator lock poisoned")
                .complete_instance(&instance_ref);
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
        instance_refs,
    })
}

fn resolve_instance_refs(
    app_data_dir: &std::path::Path,
    plugin_ids: &[String],
    requested: Option<Vec<ProviderInstanceRef>>,
) -> Vec<ProviderInstanceRef> {
    let requested_by_provider: HashMap<_, _> = requested
        .unwrap_or_default()
        .into_iter()
        .map(|instance| (instance.provider_id.clone(), instance))
        .collect();
    let selected_by_provider = load_selected_instance_ids(app_data_dir);

    plugin_ids
        .iter()
        .map(|provider_id| match requested_by_provider.get(provider_id) {
            Some(requested) if requested.instance_id.is_some() => requested.clone(),
            Some(requested) => ProviderInstanceRef {
                provider_id: provider_id.clone(),
                instance_id: selected_by_provider
                    .get(provider_id)
                    .cloned()
                    .or_else(|| requested.instance_id.clone()),
            },
            None => ProviderInstanceRef {
                provider_id: provider_id.clone(),
                instance_id: selected_by_provider.get(provider_id).cloned(),
            },
        })
        .collect()
}

fn load_selected_instance_ids(app_data_dir: &std::path::Path) -> HashMap<String, String> {
    for path in [
        app_data_dir.join("settings.json"),
        app_data_dir.join(".store").join("settings.json"),
    ] {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let Some(configs) = json
            .get("providerConfigs")
            .and_then(serde_json::Value::as_object)
        else {
            continue;
        };
        return configs
            .iter()
            .filter_map(|(provider_id, config)| {
                config
                    .get("selectedAccountProfileId")
                    .and_then(serde_json::Value::as_str)
                    .map(|instance_id| (provider_id.clone(), instance_id.to_string()))
            })
            .collect();
    }
    HashMap::new()
}
