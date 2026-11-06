use std::time::Duration;

use crate::AppState;
use crate::plugin_engine::runtime::ProviderInstanceRef;
use crate::plugin_engine::setup_detection::{self, SetupDetection};
use crate::probe_commands::resolve_instance_refs;

const SETUP_SCAN_WORKER_TIMEOUT: Duration = Duration::from_secs(15);

/// Runs only the local setup detector of one provider. Unlike `start_probe_batch`, this does
/// not run the usage probe, so it sends no request to the provider and refreshes no tokens.
#[tauri::command]
pub(crate) async fn detect_plugin_setup(
    state: tauri::State<'_, std::sync::Mutex<AppState>>,
    plugin_id: String,
    instance_ref: Option<ProviderInstanceRef>,
) -> Result<Vec<SetupDetection>, String> {
    let (plugin, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        let plugin = locked
            .plugins
            .iter()
            .find(|plugin| plugin.manifest.id == plugin_id)
            .cloned()
            .ok_or_else(|| format!("unknown provider '{}'", plugin_id))?;
        (
            plugin,
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };
    if !crate::plugin_is_probe_supported(&plugin.manifest) {
        return Err(format!(
            "{} is not supported on this platform",
            plugin.manifest.name
        ));
    }

    let instance_ref = resolve_instance_refs(
        &app_data_dir,
        std::slice::from_ref(&plugin_id),
        instance_ref.map(|instance| vec![instance]),
    )
    .into_iter()
    .next();

    let worker = tauri::async_runtime::spawn_blocking(move || {
        setup_detection::detect_local(&plugin, &app_data_dir, &app_version, instance_ref.as_ref())
    });
    let result = match tokio::time::timeout(SETUP_SCAN_WORKER_TIMEOUT, worker).await {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => Err(format!("setup scan worker failed: {}", error)),
        Err(_) => Err(format!(
            "setup scan timed out after {}s",
            SETUP_SCAN_WORKER_TIMEOUT.as_secs()
        )),
    };
    if let Err(error) = &result {
        log::warn!("setup scan for {} failed: {}", plugin_id, error);
    }
    result
}
