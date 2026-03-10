use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, LogicalPosition, Manager, Position, Size, WebviewWindow};

#[derive(Clone)]
struct TrayAnchor {
    icon_position: Position,
    icon_size: Size,
}

fn tray_anchor_slot() -> &'static Mutex<Option<TrayAnchor>> {
    static SLOT: OnceLock<Mutex<Option<TrayAnchor>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Macro to get the main tray window.
macro_rules! get_or_init_panel {
    ($app_handle:expr) => {
        match crate::panel::init($app_handle) {
            Ok(()) => $app_handle.get_webview_window("main"),
            Err(err) => {
                log::error!("Failed to init panel: {}", err);
                None
            }
        }
    };
}

pub(crate) use get_or_init_panel;

fn save_tray_anchor(icon_position: &Position, icon_size: &Size) {
    if let Ok(mut slot) = tray_anchor_slot().lock() {
        *slot = Some(TrayAnchor {
            icon_position: icon_position.clone(),
            icon_size: icon_size.clone(),
        });
    }
}

fn stored_tray_anchor() -> Option<TrayAnchor> {
    tray_anchor_slot().lock().ok().and_then(|slot| slot.clone())
}

pub fn show_panel(app_handle: &AppHandle) {
    if let Some(window) = get_or_init_panel!(app_handle) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn toggle_panel(app_handle: &AppHandle) {
    let Some(window) = get_or_init_panel!(app_handle) else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        log::debug!("toggle_panel: hiding panel");
        let _ = window.hide();
        return;
    }

    log::debug!("toggle_panel: showing panel");
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn init(app_handle: &tauri::AppHandle) -> tauri::Result<()> {
    let window = app_handle
        .get_webview_window("main")
        .expect("main window should exist");

    #[cfg(target_os = "windows")]
    {
        let _ = window.set_skip_taskbar(true);
    }

    let _ = window.set_always_on_top(true);
    Ok(())
}

fn logical_point(position: &Position, scale_factor: f64) -> (f64, f64) {
    match position {
        Position::Physical(pos) => (pos.x as f64 / scale_factor, pos.y as f64 / scale_factor),
        Position::Logical(pos) => (pos.x, pos.y),
    }
}

fn logical_size(size: &Size, scale_factor: f64) -> (f64, f64) {
    match size {
        Size::Physical(value) => (
            value.width as f64 / scale_factor,
            value.height as f64 / scale_factor,
        ),
        Size::Logical(value) => (value.width, value.height),
    }
}

fn configured_window_dimension(key: &str, fallback: f64) -> f64 {
    let conf: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri.conf.json");
    conf["app"]["windows"][0][key]
        .as_f64()
        .unwrap_or(fallback)
}

fn logical_window_size(window: &WebviewWindow) -> (f64, f64) {
    match (window.outer_size(), window.scale_factor()) {
        (Ok(size), Ok(scale_factor)) => (
            size.width as f64 / scale_factor,
            size.height as f64 / scale_factor,
        ),
        _ => (
            configured_window_dimension("width", 400.0),
            configured_window_dimension("height", 500.0),
        ),
    }
}

pub fn position_panel_at_tray_icon(
    app_handle: &tauri::AppHandle,
    icon_position: Position,
    icon_size: Size,
) {
    save_tray_anchor(&icon_position, &icon_size);
    position_panel_from_anchor(app_handle, &icon_position, &icon_size);
}

pub fn reposition_panel(app_handle: &tauri::AppHandle) {
    let Some(anchor) = stored_tray_anchor() else {
        return;
    };

    position_panel_from_anchor(app_handle, &anchor.icon_position, &anchor.icon_size);
}

fn position_panel_from_anchor(
    app_handle: &tauri::AppHandle,
    icon_position: &Position,
    icon_size: &Size,
) {
    let window = app_handle
        .get_webview_window("main")
        .expect("main window should exist");
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => return,
        },
        Err(_) => return,
    };

    let scale_factor = monitor.scale_factor();
    let (icon_x, icon_y) = logical_point(icon_position, scale_factor);
    let (icon_w, icon_h) = logical_size(icon_size, scale_factor);
    let (window_w, window_h) = logical_window_size(&window);

    let monitor_pos = monitor.position();
    let monitor_w = monitor.size().width as f64 / scale_factor;
    let monitor_h = monitor.size().height as f64 / scale_factor;
    let monitor_x = monitor_pos.x as f64 / scale_factor;
    let monitor_y = monitor_pos.y as f64 / scale_factor;
    let icon_center_x = icon_x + (icon_w / 2.0);

    let unclamped_x = icon_center_x - (window_w / 2.0);
    let min_x = monitor_x + 8.0;
    let max_x = (monitor_x + monitor_w - window_w - 8.0).max(min_x);
    let panel_x = unclamped_x.clamp(min_x, max_x);

    // Bottom taskbars should open upward; other layouts default downward.
    let icon_mid_y = icon_y + (icon_h / 2.0);
    let open_upward = icon_mid_y > monitor_y + (monitor_h / 2.0);
    let panel_y = if open_upward {
        (icon_y - window_h - 8.0).max(monitor_y + 8.0)
    } else {
        (icon_y + icon_h + 8.0).min(monitor_y + monitor_h - window_h - 8.0)
    };

    let _ = window.set_position(Position::Logical(LogicalPosition::new(panel_x, panel_y)));
}
