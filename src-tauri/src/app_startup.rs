use std::sync::{Arc, Mutex};

use tauri::Manager;

pub(crate) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    #[cfg(target_os = "macos")]
    {
        crate::app_nap::disable_app_nap();
        crate::webkit_config::disable_webview_suspension(app.handle());
    }

    let version = app.package_info().version.to_string();
    log::info!("UsageBar v{} starting", version);

    let app_data_dir = app.path().app_data_dir().expect("no app data dir");
    match crate::dev_data_migration::migrate_for_dev(&app_data_dir) {
        Ok(report) if report.copied_files > 0 => {
            log::info!(
                "Migrated {} Alpha 5 data file(s) into local Alpha 6 data",
                report.copied_files
            );
        }
        Ok(_) => {}
        Err(error) => log::warn!("Could not migrate local Alpha 5 data: {}", error),
    }

    crate::analytics::track_app_started_once_per_day_per_version(app);

    let resource_dir = app.path().resource_dir().expect("no resource dir");
    log::debug!("app_data_dir: {:?}", app_data_dir);

    let (_, plugins) = crate::plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
    let known_plugin_ids = plugins
        .iter()
        .map(|plugin| plugin.manifest.id.clone())
        .collect();
    crate::local_http_api::init(&app_data_dir, known_plugin_ids);
    crate::local_http_api::start_server();

    app.manage(Mutex::new(crate::AppState {
        plugins,
        app_data_dir,
        app_version: app.package_info().version.to_string(),
        probe_coordinator: Arc::new(Mutex::new(
            crate::probe_coordinator::ProbeCoordinator::default(),
        )),
    }));

    crate::tray::create(app.handle())?;

    app.handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;

    crate::global_shortcut::register_initial_global_shortcut(app);

    Ok(())
}
