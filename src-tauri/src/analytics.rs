const APP_STARTED_TRACKED_DAY_KEY_PREFIX: &str = "analytics.app_started_day.";

pub(crate) fn app_started_day_key(version: &str) -> String {
    format!("{}{}", APP_STARTED_TRACKED_DAY_KEY_PREFIX, version)
}

fn today_utc_ymd() -> String {
    let date = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    )
}

pub(crate) fn should_track_app_started(last_tracked_day: Option<&str>, today: &str) -> bool {
    match last_tracked_day {
        Some(day) => day != today,
        None => true,
    }
}

#[cfg(all(desktop, not(test)))]
pub(crate) fn track_app_started_once_per_day_per_version(app: &tauri::App) {
    use tauri_plugin_aptabase::EventTracker;
    use tauri_plugin_store::StoreExt;

    let version = app.package_info().version.to_string();
    let key = app_started_day_key(&version);
    let today = today_utc_ymd();

    let store = match app.handle().store("settings.json") {
        Ok(store) => store,
        Err(error) => {
            log::warn!(
                "Failed to access settings store for app_started gate: {}",
                error
            );
            return;
        }
    };

    let last_tracked_day = store
        .get(&key)
        .and_then(|value| value.as_str().map(|value| value.to_string()));

    if !should_track_app_started(last_tracked_day.as_deref(), &today) {
        return;
    }

    let _ = app.track_event("app_started", None);

    store.set(&key, serde_json::Value::String(today));
    if let Err(error) = store.save() {
        log::warn!("Failed to save app_started tracked day: {}", error);
    }
}

#[cfg(all(not(desktop), not(test)))]
pub(crate) fn track_app_started_once_per_day_per_version(app: &tauri::App) {
    use tauri_plugin_aptabase::EventTracker;

    let _ = app.track_event("app_started", None);
}
