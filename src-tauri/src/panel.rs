use std::sync::{Mutex, OnceLock};

#[cfg(target_os = "windows")]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalSize, Position, Size, WebviewWindow,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOZORDER, SetWindowPos,
};

#[derive(Clone, Debug, PartialEq)]
struct TrayAnchor {
    icon_position: Position,
    icon_size: Size,
    vertical_anchor: Option<VerticalAnchor>,
}

#[derive(Clone, Debug, PartialEq)]
enum VerticalAnchor {
    Top(f64),
    Bottom(f64),
}

#[derive(Clone, Debug, Default)]
struct PanelState {
    tray_anchor: Option<TrayAnchor>,
    last_panel_height: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct LogicalRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Debug, PartialEq)]
struct PanelPlacement {
    x: f64,
    y: f64,
    vertical_anchor: VerticalAnchor,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct PhysicalWindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn panel_state_slot() -> &'static Mutex<PanelState> {
    static SLOT: OnceLock<Mutex<PanelState>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(PanelState::default()))
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
    if let Ok(mut slot) = panel_state_slot().lock() {
        slot.tray_anchor = Some(TrayAnchor {
            icon_position: icon_position.clone(),
            icon_size: icon_size.clone(),
            vertical_anchor,
        });
    }
}

fn stored_tray_anchor() -> Option<TrayAnchor> {
    panel_state_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.tray_anchor.clone())
}

fn save_panel_height(panel_height_px: f64) {
    if !panel_height_px.is_finite() || panel_height_px <= 0.0 {
        return;
    }

    if let Ok(mut slot) = panel_state_slot().lock() {
        slot.last_panel_height = Some(panel_height_px.round());
    }
}

fn stored_panel_height() -> Option<f64> {
    panel_state_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.last_panel_height)
}

pub fn sync_panel_geometry(panel_height_px: f64) {
    save_panel_height(panel_height_px);
}

pub fn apply_panel_bounds(app_handle: &AppHandle, panel_height_px: f64) {
    save_panel_height(panel_height_px);

    let Some(anchor) = stored_tray_anchor() else {
        if let Some(window) = get_or_init_panel!(app_handle) {
            apply_window_height(&window, panel_height_px);
        }
        return;
    };

    position_panel_from_anchor(
        app_handle,
        &anchor.icon_position,
        &anchor.icon_size,
        Some(panel_height_px),
        anchor.vertical_anchor.as_ref(),
    );
}

pub fn show_panel(app_handle: &AppHandle) {
    if stored_tray_anchor().is_some() {
        reposition_panel(app_handle, stored_panel_height());
    } else {
        let _ = position_panel_near_cursor(app_handle);
    }

    let Some(window) = get_or_init_panel!(app_handle) else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn show_panel_near_cursor(app_handle: &AppHandle) {
    let _ = position_panel_near_cursor(app_handle);
    let Some(window) = get_or_init_panel!(app_handle) else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
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
    show_panel(app_handle);
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

fn apply_window_height(window: &WebviewWindow, logical_height: f64) {
    let rounded_height = logical_height.round().max(1.0);
    let (logical_width, _) = logical_window_size(window);
    apply_window_bounds(
        window,
        0.0,
        0.0,
        logical_width,
        rounded_height,
        false,
        false,
    );
}

fn physical_window_bounds(
    logical_x: f64,
    logical_y: f64,
    logical_width: f64,
    logical_height: f64,
    scale_factor: f64,
    pin_bottom_edge: bool,
) -> PhysicalWindowBounds {
    let width = (logical_width.max(1.0) * scale_factor).ceil() as u32;
    let height = (logical_height.max(1.0) * scale_factor).ceil() as u32;
    let x = (logical_x * scale_factor).round() as i32;
    let y = if pin_bottom_edge {
        ((logical_y + logical_height) * scale_factor).round() as i32 - height as i32
    } else {
        (logical_y * scale_factor).round() as i32
    };

    PhysicalWindowBounds {
        x,
        y,
        width,
        height,
    }
}

#[cfg(target_os = "windows")]
fn window_hwnd(window: &WebviewWindow) -> Option<windows_sys::Win32::Foundation::HWND> {
    let handle = window.window_handle().ok()?;
    match handle.as_raw() {
        RawWindowHandle::Win32(handle) => Some(handle.hwnd.get() as _),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn apply_window_bounds_windows(
    window: &WebviewWindow,
    bounds: PhysicalWindowBounds,
    apply_position: bool,
) -> bool {
    let Some(hwnd) = window_hwnd(window) else {
        return false;
    };

    let flags = if apply_position {
        SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOZORDER
    } else {
        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOOWNERZORDER | SWP_NOZORDER
    };
    let (x, y) = if apply_position {
        (bounds.x, bounds.y)
    } else {
        (0, 0)
    };
    let status = unsafe {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            x,
            y,
            bounds.width as i32,
            bounds.height as i32,
            flags,
        )
    };
    status != 0
}

fn apply_window_bounds(
    window: &WebviewWindow,
    logical_x: f64,
    logical_y: f64,
    logical_width: f64,
    logical_height: f64,
    apply_position: bool,
    pin_bottom_edge: bool,
) {
    let scale_factor = window.scale_factor().ok().unwrap_or(1.0);
    let bounds = physical_window_bounds(
        logical_x,
        logical_y,
        logical_width,
        logical_height,
        scale_factor,
        pin_bottom_edge,
    );

    #[cfg(target_os = "windows")]
    if apply_window_bounds_windows(window, bounds, apply_position) {
        return;
    }

    if apply_position {
        let _ = window.set_position(Position::Logical(LogicalPosition::new(
            logical_x, logical_y,
        )));
    }

    let _ = window.set_size(Size::Physical(PhysicalSize::new(
        bounds.width,
        bounds.height,
    )));
}

fn compute_panel_placement(
    icon_rect: LogicalRect,
    window_w: f64,
    measured_window_h: f64,
    work_area: LogicalRect,
    panel_height_override: Option<f64>,
    stored_vertical_anchor: Option<&VerticalAnchor>,
) -> PanelPlacement {
    let window_h = panel_height_override
        .filter(|height| height.is_finite() && *height > 0.0)
        .unwrap_or(measured_window_h);

    let icon_center_x = icon_rect.x + (icon_rect.width / 2.0);
    let unclamped_x = icon_center_x - (window_w / 2.0);
    let min_x = work_area.x + 8.0;
    let max_x = (work_area.x + work_area.width - window_w - 8.0).max(min_x);
    let panel_x = unclamped_x.clamp(min_x, max_x);

    let computed_vertical_anchor = {
        let icon_mid_y = icon_rect.y + (icon_rect.height / 2.0);
        if icon_mid_y > work_area.y + (work_area.height / 2.0) {
            VerticalAnchor::Bottom(icon_rect.y - 8.0)
        } else {
            VerticalAnchor::Top(icon_rect.y + icon_rect.height + 8.0)
        }
    };

    let vertical_anchor = stored_vertical_anchor
        .cloned()
        .unwrap_or(computed_vertical_anchor);
    let unclamped_panel_y = match vertical_anchor.clone() {
        VerticalAnchor::Top(anchor_y) => anchor_y,
        VerticalAnchor::Bottom(anchor_y) => anchor_y - window_h,
    };
    let min_y = work_area.y + 8.0;
    let max_y = (work_area.y + work_area.height - window_h - 8.0).max(min_y);
    let panel_y = unclamped_panel_y.clamp(min_y, max_y);

    PanelPlacement {
        x: panel_x,
        y: panel_y,
        vertical_anchor,
    }
}

fn resolved_panel_height(measured_window_h: f64, panel_height_override: Option<f64>) -> f64 {
    panel_height_override
        .filter(|height| height.is_finite() && *height > 0.0)
        .unwrap_or(measured_window_h)
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
    let work_area = monitor.work_area();
    let work_area_rect = LogicalRect {
        x: work_area.position.x as f64 / scale_factor,
        y: work_area.position.y as f64 / scale_factor,
        width: work_area.size.width as f64 / scale_factor,
        height: work_area.size.height as f64 / scale_factor,
    };

    let target_window_h = resolved_panel_height(
        measured_window_h,
        panel_height_px.or_else(stored_panel_height),
    );

    let placement = compute_panel_placement(
        LogicalRect {
            x: icon_x,
            y: icon_y,
            width: icon_w,
            height: icon_h,
        },
        window_w,
        measured_window_h,
        work_area_rect,
        Some(target_window_h),
        stored_vertical_anchor,
    );

    apply_window_bounds(
        &window,
        placement.x,
        placement.y,
        window_w,
        target_window_h,
        true,
        matches!(placement.vertical_anchor, VerticalAnchor::Bottom(_)),
    );
    Some(placement.vertical_anchor)
}

fn position_panel_near_cursor(app_handle: &AppHandle) -> Option<VerticalAnchor> {
    let cursor = app_handle.cursor_position().ok()?;
    let monitor = app_handle
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| app_handle.primary_monitor().ok().flatten())?;
    let scale_factor = monitor.scale_factor();
    let cursor_x = cursor.x / scale_factor;
    let cursor_y = cursor.y / scale_factor;

    let anchor_size = Size::Logical(LogicalSize::new(24.0, 24.0));
    let anchor_position = Position::Logical(LogicalPosition::new(cursor_x - 12.0, cursor_y - 12.0));
    let vertical_anchor =
        position_panel_from_anchor(app_handle, &anchor_position, &anchor_size, None, None);
    save_tray_anchor(&anchor_position, &anchor_size, vertical_anchor.clone());
    vertical_anchor
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
    if let Some(height) = panel_height_px {
        save_panel_height(height);
    }

    let Some(anchor) = stored_tray_anchor() else {
        return;
    };

    position_panel_from_anchor(
        app_handle,
        &anchor.icon_position,
        &anchor.icon_size,
        panel_height_px.or_else(stored_panel_height),
        anchor.vertical_anchor.as_ref(),
    );
}

#[cfg(test)]
mod tests {
    use super::{
        LogicalRect, PhysicalWindowBounds, VerticalAnchor, compute_panel_placement,
        physical_window_bounds,
    };

    #[test]
    fn cursor_style_anchor_stays_within_work_area() {
        let placement = compute_panel_placement(
            LogicalRect {
                x: 392.0,
                y: 592.0,
                width: 24.0,
                height: 24.0,
            },
            400.0,
            500.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 420.0,
                height: 620.0,
            },
            Some(500.0),
            None,
        );

        assert_eq!(placement.x, 12.0);
        assert_eq!(placement.y, 84.0);
        assert_eq!(placement.vertical_anchor, VerticalAnchor::Bottom(584.0));
    }

    #[test]
    fn stored_height_override_is_used_for_bottom_anchor() {
        let placement = compute_panel_placement(
            LogicalRect {
                x: 300.0,
                y: 560.0,
                width: 24.0,
                height: 24.0,
            },
            400.0,
            300.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 900.0,
                height: 700.0,
            },
            Some(520.0),
            Some(&VerticalAnchor::Bottom(552.0)),
        );

        assert_eq!(placement.y, 32.0);
        assert_eq!(placement.vertical_anchor, VerticalAnchor::Bottom(552.0));
    }

    #[test]
    fn top_and_bottom_anchors_clamp_to_work_area() {
        let top = compute_panel_placement(
            LogicalRect {
                x: 100.0,
                y: 10.0,
                width: 24.0,
                height: 24.0,
            },
            300.0,
            500.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 600.0,
                height: 420.0,
            },
            Some(500.0),
            None,
        );
        assert_eq!(top.y, 8.0);

        let bottom = compute_panel_placement(
            LogicalRect {
                x: 100.0,
                y: 380.0,
                width: 24.0,
                height: 24.0,
            },
            300.0,
            500.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 600.0,
                height: 420.0,
            },
            Some(500.0),
            None,
        );
        assert_eq!(bottom.y, 8.0);
        assert_eq!(bottom.vertical_anchor, VerticalAnchor::Bottom(372.0));
    }

    #[test]
    fn bottom_anchor_recomputes_top_from_final_height() {
        let short = compute_panel_placement(
            LogicalRect {
                x: 100.0,
                y: 560.0,
                width: 24.0,
                height: 24.0,
            },
            300.0,
            320.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 800.0,
                height: 700.0,
            },
            Some(320.0),
            Some(&VerticalAnchor::Bottom(552.0)),
        );

        let tall = compute_panel_placement(
            LogicalRect {
                x: 100.0,
                y: 560.0,
                width: 24.0,
                height: 24.0,
            },
            300.0,
            520.0,
            LogicalRect {
                x: 0.0,
                y: 0.0,
                width: 800.0,
                height: 700.0,
            },
            Some(520.0),
            Some(&VerticalAnchor::Bottom(552.0)),
        );

        assert_eq!(short.y + 320.0, 552.0);
        assert_eq!(tall.y + 520.0, 552.0);
    }

    #[test]
    fn physical_bottom_anchor_rounding_keeps_bottom_edge_fixed() {
        let short = physical_window_bounds(48.0, 132.8, 400.0, 320.0, 1.25, true);
        let tall = physical_window_bounds(48.0, 12.8, 400.0, 440.0, 1.25, true);

        assert_eq!(short.width, 500);
        assert_eq!(short.height, 400);
        assert_eq!(tall.height, 550);
        assert_eq!(short.y + short.height as i32, tall.y + tall.height as i32);
        assert_eq!(short.y + short.height as i32, 566);
    }

    #[test]
    fn physical_top_anchor_rounding_keeps_top_edge_fixed() {
        let bounds = physical_window_bounds(24.0, 18.4, 400.0, 320.0, 1.25, false);

        assert_eq!(
            bounds,
            PhysicalWindowBounds {
                x: 30,
                y: 23,
                width: 500,
                height: 400,
            }
        );
    }
}
