//! Which monitor a tray anchor belongs to.
//!
//! A floating panel can sit on another monitor than the tray. Re-anchoring
//! must use the tray's monitor, with that monitor's scale, not the monitor the
//! window is on now.

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

#[cfg(test)]
mod tests {
    use super::*;

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
