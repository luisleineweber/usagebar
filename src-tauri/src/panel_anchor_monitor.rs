//! Which monitor a tray anchor belongs to.
//!
//! A floating panel can sit on another monitor than the tray. Re-anchoring
//! must use the tray's monitor, with that monitor's scale, not the monitor the
//! window is on now.
//!
//! Anchors the app creates (cursor, taskbar corner) are physical. A logical
//! point is ambiguous with mixed DPI: the same logical point can lie inside
//! two monitors once each monitor's scale is applied.

use tauri::{PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};

/// Size of the synthetic anchor rect around a cursor or taskbar corner.
const SYNTHETIC_ANCHOR_LOGICAL: f64 = 24.0;

/// A monitor's full bounds (not its work area) in physical px.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// An anchor point. Logical points were made by dividing a physical point by
/// the scale of the monitor it was on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum AnchorPoint {
    Physical { x: f64, y: f64 },
    Logical { x: f64, y: f64 },
}

impl AnchorPoint {
    /// The physical point, read with `monitor`'s scale.
    fn physical_on(self, monitor: &MonitorBounds) -> (f64, f64) {
        match self {
            Self::Physical { x, y } => (x, y),
            Self::Logical { x, y } => {
                let scale = if monitor.scale_factor.is_finite() && monitor.scale_factor > 0.0 {
                    monitor.scale_factor
                } else {
                    1.0
                };
                (x * scale, y * scale)
            }
        }
    }
}

/// Squared distance from `point` to the nearest point of `monitor`; zero inside.
fn distance_squared(monitor: &MonitorBounds, point: (f64, f64)) -> f64 {
    let left = f64::from(monitor.x);
    let top = f64::from(monitor.y);
    let right = left + f64::from(monitor.width);
    let bottom = top + f64::from(monitor.height);
    let dx = if point.0 < left {
        left - point.0
    } else if point.0 >= right {
        point.0 - right + 1.0
    } else {
        0.0
    };
    let dy = if point.1 < top {
        top - point.1
    } else if point.1 >= bottom {
        point.1 - bottom + 1.0
    } else {
        0.0
    };
    dx * dx + dy * dy
}

/// The index of the monitor that contains `anchor`, or the nearest one.
/// `None` only when there are no monitors.
pub(crate) fn anchor_monitor_index(
    monitors: &[MonitorBounds],
    anchor: AnchorPoint,
) -> Option<usize> {
    monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| {
            (
                index,
                distance_squared(monitor, anchor.physical_on(monitor)),
            )
        })
        .min_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(index, _)| index)
}

fn synthetic_anchor(origin: (f64, f64), scale_factor: f64) -> (Position, Size) {
    let side = (SYNTHETIC_ANCHOR_LOGICAL * scale_factor).round().max(1.0);
    (
        Position::Physical(PhysicalPosition::new(
            origin.0.round() as i32,
            origin.1.round() as i32,
        )),
        Size::Physical(PhysicalSize::new(side as u32, side as u32)),
    )
}

/// A physical anchor rect centered on the cursor's physical position.
pub(crate) fn cursor_anchor(cursor: (f64, f64), scale_factor: f64) -> (Position, Size) {
    let half = SYNTHETIC_ANCHOR_LOGICAL * scale_factor / 2.0;
    synthetic_anchor((cursor.0 - half, cursor.1 - half), scale_factor)
}

/// A physical anchor rect whose top-right corner is the physical bottom-right
/// corner of a work area.
pub(crate) fn taskbar_anchor(work_area_corner: (f64, f64), scale_factor: f64) -> (Position, Size) {
    let side = SYNTHETIC_ANCHOR_LOGICAL * scale_factor;
    synthetic_anchor(
        (work_area_corner.0 - side, work_area_corner.1),
        scale_factor,
    )
}

/// The center of an anchor rect, or its origin when the units differ.
pub(crate) fn anchor_point(position: &Position, size: &Size) -> AnchorPoint {
    match (position, size) {
        (Position::Physical(pos), Size::Physical(size)) => AnchorPoint::Physical {
            x: f64::from(pos.x) + f64::from(size.width) / 2.0,
            y: f64::from(pos.y) + f64::from(size.height) / 2.0,
        },
        (Position::Physical(pos), Size::Logical(_)) => AnchorPoint::Physical {
            x: f64::from(pos.x),
            y: f64::from(pos.y),
        },
        (Position::Logical(pos), Size::Logical(size)) => AnchorPoint::Logical {
            x: pos.x + size.width / 2.0,
            y: pos.y + size.height / 2.0,
        },
        (Position::Logical(pos), Size::Physical(_)) => AnchorPoint::Logical { x: pos.x, y: pos.y },
    }
}

/// The monitor the anchor is on. A floating panel may sit on another monitor,
/// so the window's current monitor is only the fallback.
pub(crate) fn anchor_monitor(
    window: &WebviewWindow,
    position: &Position,
    size: &Size,
) -> Option<tauri::Monitor> {
    if let Ok(monitors) = window.available_monitors() {
        let bounds: Vec<MonitorBounds> = monitors
            .iter()
            .map(|monitor| MonitorBounds {
                x: monitor.position().x,
                y: monitor.position().y,
                width: monitor.size().width,
                height: monitor.size().height,
                scale_factor: monitor.scale_factor(),
            })
            .collect();
        if let Some(index) = anchor_monitor_index(&bounds, anchor_point(position, size)) {
            return monitors.into_iter().nth(index);
        }
    }
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::{LogicalPosition, LogicalSize};

    /// Primary 1920x1080 at 100%, a 150% monitor to its right.
    fn primary_and_high_dpi_right() -> Vec<MonitorBounds> {
        vec![
            monitor(0, 0, 1920, 1080, 1.0),
            monitor(1920, 0, 3840, 2160, 1.5),
        ]
    }

    /// Regression (Movable off): the cursor path used to store the cursor as
    /// logical (1600, 400), which lies inside both monitors once each scale is
    /// applied, and the primary won. The physical anchor is unambiguous.
    #[test]
    fn cursor_on_a_high_dpi_monitor_selects_that_monitor() {
        let (position, size) = cursor_anchor((2400.0, 600.0), 1.5);
        assert_eq!(
            position,
            Position::Physical(PhysicalPosition::new(2382, 582))
        );
        assert_eq!(size, Size::Physical(PhysicalSize::new(36, 36)));
        assert_eq!(
            anchor_monitor_index(
                &primary_and_high_dpi_right(),
                anchor_point(&position, &size)
            ),
            Some(1)
        );

        let ambiguous_logical = AnchorPoint::Logical {
            x: 1600.0,
            y: 400.0,
        };
        assert_eq!(
            anchor_monitor_index(&primary_and_high_dpi_right(), ambiguous_logical),
            Some(0),
            "documents why cursor anchors must not be logical"
        );
    }

    #[test]
    fn cursor_on_the_primary_selects_the_primary() {
        let (position, size) = cursor_anchor((1800.0, 1000.0), 1.0);
        assert_eq!(
            anchor_monitor_index(
                &primary_and_high_dpi_right(),
                anchor_point(&position, &size)
            ),
            Some(0)
        );
    }

    #[test]
    fn taskbar_anchor_sits_inside_the_bottom_right_of_its_monitor() {
        // 150% monitor work area ends at physical (5760, 2088).
        let (position, size) = taskbar_anchor((5760.0, 2088.0), 1.5);
        assert_eq!(
            position,
            Position::Physical(PhysicalPosition::new(5724, 2088))
        );
        assert_eq!(size, Size::Physical(PhysicalSize::new(36, 36)));
        assert_eq!(
            anchor_monitor_index(
                &primary_and_high_dpi_right(),
                anchor_point(&position, &size)
            ),
            Some(1)
        );
    }

    #[test]
    fn tray_anchor_uses_the_icon_center_in_matching_units() {
        assert_eq!(
            anchor_point(
                &Position::Physical(PhysicalPosition::new(1780, 1040)),
                &Size::Physical(PhysicalSize::new(40, 40)),
            ),
            AnchorPoint::Physical {
                x: 1800.0,
                y: 1060.0
            }
        );
        assert_eq!(
            anchor_point(
                &Position::Logical(LogicalPosition::new(-1012.0, 588.0)),
                &Size::Logical(LogicalSize::new(24.0, 24.0)),
            ),
            AnchorPoint::Logical {
                x: -1000.0,
                y: 600.0
            }
        );
    }

    fn monitor(x: i32, y: i32, width: u32, height: u32, scale_factor: f64) -> MonitorBounds {
        MonitorBounds {
            x,
            y,
            width,
            height,
            scale_factor,
        }
    }

    /// Primary 1920x1080 at 100% with the tray, a 150% monitor to the left.
    fn layout() -> Vec<MonitorBounds> {
        vec![
            monitor(-2560, -200, 2560, 1440, 1.5),
            monitor(0, 0, 1920, 1080, 1.0),
        ]
    }

    #[test]
    fn physical_tray_icon_selects_its_own_monitor() {
        let tray = AnchorPoint::Physical {
            x: 1800.0,
            y: 1060.0,
        };
        assert_eq!(anchor_monitor_index(&layout(), tray), Some(1));
    }

    #[test]
    fn point_on_a_negative_origin_monitor_selects_that_monitor() {
        let point = AnchorPoint::Physical {
            x: -100.0,
            y: -150.0,
        };
        assert_eq!(anchor_monitor_index(&layout(), point), Some(0));
    }

    #[test]
    fn logical_anchor_is_read_with_each_monitor_scale() {
        // A cursor anchor at physical (-1500, 900) on the 150% monitor was
        // stored as logical (-1000, 600).
        let left = AnchorPoint::Logical {
            x: -1000.0,
            y: 600.0,
        };
        assert_eq!(anchor_monitor_index(&layout(), left), Some(0));

        let primary = AnchorPoint::Logical {
            x: 1800.0,
            y: 1000.0,
        };
        assert_eq!(anchor_monitor_index(&layout(), primary), Some(1));
    }

    #[test]
    fn anchor_on_a_removed_monitor_selects_the_nearest_one() {
        let gone = AnchorPoint::Physical {
            x: 2500.0,
            y: 500.0,
        };
        assert_eq!(anchor_monitor_index(&layout(), gone), Some(1));
    }

    #[test]
    fn no_monitors_means_no_anchor_monitor() {
        assert_eq!(
            anchor_monitor_index(&[], AnchorPoint::Physical { x: 0.0, y: 0.0 }),
            None
        );
    }
}
