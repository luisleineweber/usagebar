//! The opt-in movable tray panel.
//!
//! By default the panel anchors to the tray. With **Movable panel** on, the
//! user can drag it (or move it with the keyboard). The spot is remembered and
//! used for every later open and content resize, clamped into a current work
//! area. **Return to tray** forgets the spot.

use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::panel_floating_geometry::{
    MonitorArea, PhysicalRect, resolve_floating_bounds, resolve_nudged_bounds,
};
use crate::panel_move_tracking::{self, PanelWindowSignal};
use crate::panel_placement_store::{self, FloatingOrigin, PanelPlacement};

pub(crate) const PANEL_PLACEMENT_CHANGED_EVENT: &str = "panel-placement-changed";
/// The largest keyboard step the UI may request, in logical px.
const MAX_NUDGE_LOGICAL: f64 = 200.0;
/// Move tracking exists only for Win32, matching the Windows-first scope.
const MOVABLE_PANEL_SUPPORTED: bool = cfg!(target_os = "windows");

/// What the UI needs to render the move controls.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PanelPlacementView {
    pub movable: bool,
    pub floating: bool,
}

impl From<PanelPlacement> for PanelPlacementView {
    fn from(placement: PanelPlacement) -> Self {
        Self {
            movable: placement.movable,
            floating: placement.active_floating_origin().is_some(),
        }
    }
}

/// Turning movable off also forgets the spot, so turning it on again starts
/// anchored to the tray.
pub(crate) fn with_movable(placement: PanelPlacement, enabled: bool) -> PanelPlacement {
    PanelPlacement {
        movable: enabled,
        floating_origin: if enabled {
            placement.floating_origin
        } else {
            None
        },
    }
}

pub(crate) fn returned_to_tray(placement: PanelPlacement) -> PanelPlacement {
    PanelPlacement {
        floating_origin: None,
        ..placement
    }
}

/// A user move is remembered only while movable is on.
pub(crate) fn with_user_origin(
    placement: PanelPlacement,
    origin: FloatingOrigin,
) -> Option<PanelPlacement> {
    placement.movable.then_some(PanelPlacement {
        floating_origin: Some(origin),
        ..placement
    })
}

/// Only turning movable on needs platform support; turning it off always works.
pub(crate) fn check_movable_supported(enabled: bool, supported: bool) -> Result<(), String> {
    if enabled && !supported {
        Err("Movable panel is only available on Windows".to_string())
    } else {
        Ok(())
    }
}

pub(crate) fn validate_nudge(dx: f64, dy: f64) -> Result<(f64, f64), String> {
    let valid = |value: f64| value.is_finite() && value.abs() <= MAX_NUDGE_LOGICAL;
    if valid(dx) && valid(dy) {
        Ok((dx, dy))
    } else {
        Err(format!(
            "panel nudge must be finite and at most {MAX_NUDGE_LOGICAL} px per axis"
        ))
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Start native move tracking for the panel window.
pub(crate) fn init(app_handle: &AppHandle) {
    let _ = APP.set(app_handle.clone());
    let Some(window) = app_handle.get_webview_window("main") else {
        log::error!("movable panel: main window is missing");
        return;
    };
    panel_move_tracking::install(&window, handle_window_signal);
}

fn handle_window_signal(signal: PanelWindowSignal) {
    let Some(app_handle) = APP.get().cloned() else {
        return;
    };
    // The subclass already deferred this signal through a posted message, so
    // tao has finished its own move or DPI handling. On the main thread this
    // runs inline.
    let scheduled = app_handle.clone().run_on_main_thread(move || match signal {
        PanelWindowSignal::UserMoveEnded { x, y } => record_user_move(&app_handle, x, y),
        PanelWindowSignal::DisplayChanged => reapply_floating_bounds(&app_handle),
    });
    if let Err(error) = scheduled {
        log::error!("movable panel: could not schedule window signal: {error}");
    }
}

fn main_window(app_handle: &AppHandle) -> Result<WebviewWindow, String> {
    app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window is missing".to_string())
}

fn monitor_areas(window: &WebviewWindow) -> Vec<MonitorArea> {
    match window.available_monitors() {
        Ok(monitors) => monitors
            .iter()
            .map(|monitor| {
                let area = monitor.work_area();
                MonitorArea {
                    work_area: PhysicalRect {
                        x: area.position.x,
                        y: area.position.y,
                        width: area.size.width,
                        height: area.size.height,
                    },
                    scale_factor: monitor.scale_factor(),
                }
            })
            .collect(),
        Err(error) => {
            log::error!("movable panel: could not list monitors: {error}");
            Vec::new()
        }
    }
}

/// The physical bounds for a floating panel of the given logical size, or
/// `None` when the panel is anchored to the tray.
pub(crate) fn floating_bounds(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
) -> Option<PhysicalRect> {
    let origin = panel_placement_store::current().active_floating_origin()?;
    resolve_floating_bounds(
        (origin.x, origin.y),
        logical_width,
        logical_height,
        &monitor_areas(window),
    )
}

fn logical_panel_size(window: &WebviewWindow) -> Result<(f64, f64), String> {
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    Ok((size.width as f64 / scale, size.height as f64 / scale))
}

/// Move the window to the bounds `resolve` picks for its logical size and
/// remember them as the floating origin.
fn place_and_remember(
    app_handle: &AppHandle,
    resolve: impl FnOnce(f64, f64, &[MonitorArea]) -> Option<PhysicalRect>,
) -> Result<(), String> {
    let window = main_window(app_handle)?;
    let (width, height) = logical_panel_size(&window)?;
    let bounds = resolve(width, height, &monitor_areas(&window))
        .ok_or_else(|| "no monitor is available for the panel".to_string())?;
    let remembered = FloatingOrigin {
        x: bounds.x,
        y: bounds.y,
    };
    let mut ignored = false;
    let placement = panel_placement_store::update(|placement| {
        match with_user_origin(*placement, remembered) {
            Some(next) => *placement = next,
            None => ignored = true,
        }
    })?;
    if ignored {
        return Ok(());
    }
    crate::panel::apply_physical_bounds(&window, bounds);
    emit_placement(app_handle, placement);
    Ok(())
}

fn record_user_move(app_handle: &AppHandle, x: i32, y: i32) {
    let placed = place_and_remember(app_handle, |width, height, monitors| {
        resolve_floating_bounds((x, y), width, height, monitors)
    });
    if let Err(error) = placed {
        log::error!("movable panel: could not remember the moved panel: {error}");
    }
}

fn reapply_floating_bounds(app_handle: &AppHandle) {
    let Ok(window) = main_window(app_handle) else {
        return;
    };
    if panel_move_tracking::user_move_in_progress() {
        return;
    }
    let Ok((width, height)) = logical_panel_size(&window) else {
        return;
    };
    if let Some(bounds) = floating_bounds(&window, width, height) {
        crate::panel::apply_physical_bounds(&window, bounds);
    }
}

fn emit_placement(app_handle: &AppHandle, placement: PanelPlacement) {
    if let Err(error) = app_handle.emit(
        PANEL_PLACEMENT_CHANGED_EVENT,
        PanelPlacementView::from(placement),
    ) {
        log::error!("movable panel: could not emit placement change: {error}");
    }
}

pub(crate) fn placement_view() -> PanelPlacementView {
    panel_placement_store::current().into()
}

pub(crate) fn set_movable(
    app_handle: &AppHandle,
    enabled: bool,
) -> Result<PanelPlacementView, String> {
    check_movable_supported(enabled, MOVABLE_PANEL_SUPPORTED)?;
    let was_floating = panel_placement_store::current()
        .active_floating_origin()
        .is_some();
    let placement =
        panel_placement_store::update(|placement| *placement = with_movable(*placement, enabled))?;
    if was_floating && placement.active_floating_origin().is_none() {
        crate::panel::reanchor_panel(app_handle);
    }
    emit_placement(app_handle, placement);
    Ok(placement.into())
}

pub(crate) fn return_to_tray(app_handle: &AppHandle) -> Result<PanelPlacementView, String> {
    let placement =
        panel_placement_store::update(|placement| *placement = returned_to_tray(*placement))?;
    crate::panel::reanchor_panel(app_handle);
    emit_placement(app_handle, placement);
    Ok(placement.into())
}

fn require_movable() -> Result<(), String> {
    if panel_placement_store::current().movable {
        Ok(())
    } else {
        Err("Movable panel is off".to_string())
    }
}

pub(crate) fn start_drag(app_handle: &AppHandle) -> Result<(), String> {
    require_movable()?;
    main_window(app_handle)?
        .start_dragging()
        .map_err(|error| format!("could not start moving the panel: {error}"))
}

pub(crate) fn nudge(
    app_handle: &AppHandle,
    dx: f64,
    dy: f64,
) -> Result<PanelPlacementView, String> {
    require_movable()?;
    let delta = validate_nudge(dx, dy)?;
    let window = main_window(app_handle)?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let current = PhysicalRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    place_and_remember(app_handle, |width, height, monitors| {
        resolve_nudged_bounds(current, delta, width, height, monitors)
    })?;
    Ok(placement_view())
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORIGIN: FloatingOrigin = FloatingOrigin { x: -1200, y: 40 };

    fn floating() -> PanelPlacement {
        PanelPlacement {
            movable: true,
            floating_origin: Some(ORIGIN),
        }
    }

    #[test]
    fn view_reports_floating_only_when_movable_with_an_origin() {
        assert_eq!(
            PanelPlacementView::from(PanelPlacement::default()),
            PanelPlacementView {
                movable: false,
                floating: false
            }
        );
        assert_eq!(
            PanelPlacementView::from(floating()),
            PanelPlacementView {
                movable: true,
                floating: true
            }
        );
        assert_eq!(
            PanelPlacementView::from(PanelPlacement {
                movable: false,
                floating_origin: Some(ORIGIN),
            }),
            PanelPlacementView {
                movable: false,
                floating: false
            }
        );
    }

    #[test]
    fn enabling_movable_keeps_the_panel_anchored_until_moved() {
        let enabled = with_movable(PanelPlacement::default(), true);
        assert_eq!(
            enabled,
            PanelPlacement {
                movable: true,
                floating_origin: None
            }
        );
    }

    #[test]
    fn disabling_movable_forgets_the_spot() {
        assert_eq!(with_movable(floating(), false), PanelPlacement::default());
    }

    #[test]
    fn return_to_tray_keeps_movable_on_and_forgets_the_spot() {
        assert_eq!(
            returned_to_tray(floating()),
            PanelPlacement {
                movable: true,
                floating_origin: None
            }
        );
    }

    #[test]
    fn user_moves_are_ignored_while_movable_is_off() {
        assert_eq!(with_user_origin(PanelPlacement::default(), ORIGIN), None);
        assert_eq!(
            with_user_origin(with_movable(PanelPlacement::default(), true), ORIGIN),
            Some(floating())
        );
    }

    #[test]
    fn movable_can_be_turned_on_only_where_move_tracking_exists() {
        assert_eq!(check_movable_supported(true, true), Ok(()));
        assert_eq!(check_movable_supported(false, false), Ok(()));
        assert_eq!(
            check_movable_supported(true, false),
            Err("Movable panel is only available on Windows".to_string())
        );
        assert_eq!(MOVABLE_PANEL_SUPPORTED, cfg!(target_os = "windows"));
    }

    #[test]
    fn nudge_rejects_non_finite_or_oversized_steps() {
        assert_eq!(validate_nudge(10.0, -50.0), Ok((10.0, -50.0)));
        assert!(validate_nudge(f64::NAN, 0.0).is_err());
        assert!(validate_nudge(0.0, f64::INFINITY).is_err());
        assert!(validate_nudge(500.0, 0.0).is_err());
    }
}
