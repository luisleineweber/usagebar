use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, LogicalPosition, Manager, Position, Size, WebviewWindow};

#[derive(Clone)]
struct TrayAnchor {
    icon_position: Position,
    icon_size: Size,
    vertical_anchor: Option<VerticalAnchor>,
}

#[derive(Clone)]
enum VerticalAnchor {
    Top(f64),
    Bottom(f64),
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

fn save_tray_anchor(
    icon_position: &Position,
    icon_size: &Size,
    vertical_anchor: Option<VerticalAnchor>,
) {
    if let Ok(mut slot) = tray_anchor_slot().lock() {
        *slot = Some(TrayAnchor {
            icon_position: icon_position.clone(),
            icon_size: icon_size.clone(),
            vertical_anchor,
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
    conf["app"]["windows"][0][key].as_f64().unwrap_or(fallback)
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
    let vertical_anchor =
        position_panel_from_anchor(app_handle, &icon_position, &icon_size, None, None);
    save_tray_anchor(&icon_position, &icon_size, vertical_anchor);
}

pub fn reposition_panel(app_handle: &tauri::AppHandle, panel_height_px: Option<f64>) {
    let Some(anchor) = stored_tray_anchor() else {
        return;
    };

    position_panel_from_anchor(
        app_handle,
        &anchor.icon_position,
        &anchor.icon_size,
        panel_height_px,
        anchor.vertical_anchor.as_ref(),
    );
}

fn position_panel_from_anchor(
    app_handle: &tauri::AppHandle,
    icon_position: &Position,
    icon_size: &Size,
    panel_height_px: Option<f64>,
    stored_vertical_anchor: Option<&VerticalAnchor>,
) -> Option<VerticalAnchor> {
    let window = app_handle
        .get_webview_window("main")
        .expect("main window should exist");
    let monitor = match window.current_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => match window.primary_monitor() {
            Ok(Some(monitor)) => monitor,
            _ => return None,
        },
        Err(_) => return None,
    };

    let scale_factor = monitor.scale_factor();
    let (icon_x, icon_y) = logical_point(icon_position, scale_factor);
    let (icon_w, icon_h) = logical_size(icon_size, scale_factor);
    let (window_w, measured_window_h) = logical_window_size(&window);
    let window_h = panel_height_px
        .filter(|height| height.is_finite() && *height > 0.0)
        .unwrap_or(measured_window_h);

    let work_area = monitor.work_area();
    let work_area_w = work_area.size.width as f64 / scale_factor;
    let work_area_h = work_area.size.height as f64 / scale_factor;
    let work_area_x = work_area.position.x as f64 / scale_factor;
    let work_area_y = work_area.position.y as f64 / scale_factor;
    let icon_center_x = icon_x + (icon_w / 2.0);

    let unclamped_x = icon_center_x - (window_w / 2.0);
    let min_x = work_area_x + 8.0;
    let max_x = (work_area_x + work_area_w - window_w - 8.0).max(min_x);
    let panel_x = unclamped_x.clamp(min_x, max_x);

    let computed_vertical_anchor = {
        // Bottom taskbars should keep the lower edge fixed; top taskbars keep the upper edge fixed.
        let icon_mid_y = icon_y + (icon_h / 2.0);
        if icon_mid_y > work_area_y + (work_area_h / 2.0) {
            VerticalAnchor::Bottom(icon_y - 8.0)
        } else {
            VerticalAnchor::Top(icon_y + icon_h + 8.0)
        }
    };

    let vertical_anchor = stored_vertical_anchor
        .cloned()
        .unwrap_or_else(|| computed_vertical_anchor.clone());
    let unclamped_panel_y = match vertical_anchor.clone() {
        VerticalAnchor::Top(anchor_y) => anchor_y,
        VerticalAnchor::Bottom(anchor_y) => anchor_y - window_h,
    };
    let min_y = work_area_y + 8.0;
    let max_y = (work_area_y + work_area_h - window_h - 8.0).max(min_y);
    let panel_y = unclamped_panel_y.clamp(min_y, max_y);

    let _ = window.set_position(Position::Logical(LogicalPosition::new(panel_x, panel_y)));
    Some(vertical_anchor)
}
