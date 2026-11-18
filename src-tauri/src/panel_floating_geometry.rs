//! Pure geometry for the opt-in floating tray panel.
//!
//! All values are physical pixels in the Windows virtual-screen space. Origins
//! can be negative when a monitor sits left of or above the primary monitor.

/// Gap between the floating panel and the work-area edge, in logical px.
pub(crate) const FLOATING_EDGE_INSET_LOGICAL: f64 = 8.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PhysicalRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl PhysicalRect {
    fn right(&self) -> i64 {
        i64::from(self.x) + i64::from(self.width)
    }

    fn bottom(&self) -> i64 {
        i64::from(self.y) + i64::from(self.height)
    }
}

/// One monitor as the panel sees it: its work area and its DPI scale.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct MonitorArea {
    pub work_area: PhysicalRect,
    pub scale_factor: f64,
}

/// The panel size at `scale_factor`, rounded up so content never clips.
fn physical_panel_size(logical_width: f64, logical_height: f64, scale_factor: f64) -> (u32, u32) {
    let scale = sanitized_scale(scale_factor);
    (
        (logical_width.max(1.0) * scale).ceil() as u32,
        (logical_height.max(1.0) * scale).ceil() as u32,
    )
}

fn sanitized_scale(scale_factor: f64) -> f64 {
    if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn overlap_area(a: &PhysicalRect, b: &PhysicalRect) -> i64 {
    let width = (a.right().min(b.right()) - i64::from(a.x).max(i64::from(b.x))).max(0);
    let height = (a.bottom().min(b.bottom()) - i64::from(a.y).max(i64::from(b.y))).max(0);
    width * height
}

/// Squared distance between doubled centers, so the math stays in integers.
fn center_distance(a: &PhysicalRect, b: &PhysicalRect) -> i64 {
    let dx = (i64::from(a.x) + a.right()) - (i64::from(b.x) + b.right());
    let dy = (i64::from(a.y) + a.bottom()) - (i64::from(b.y) + b.bottom());
    dx.saturating_mul(dx).saturating_add(dy.saturating_mul(dy))
}

/// The monitor the panel belongs to: the one it overlaps most, or, when a
/// display change left it on no monitor, the one whose work area is nearest.
fn choose_monitor(
    monitors: &[MonitorArea],
    origin: (i32, i32),
    logical_width: f64,
    logical_height: f64,
) -> Option<MonitorArea> {
    monitors.iter().copied().max_by_key(|monitor| {
        let (width, height) =
            physical_panel_size(logical_width, logical_height, monitor.scale_factor);
        let panel = PhysicalRect {
            x: origin.0,
            y: origin.1,
            width,
            height,
        };
        (
            overlap_area(&monitor.work_area, &panel),
            std::cmp::Reverse(center_distance(&monitor.work_area, &panel)),
        )
    })
}

fn clamp_axis(value: i32, start: i32, length: u32, size: u32, inset: i32) -> i32 {
    let min = i64::from(start) + i64::from(inset);
    let max = (i64::from(start) + i64::from(length) - i64::from(size) - i64::from(inset)).max(min);
    i64::from(value).clamp(min, max) as i32
}

/// Where the floating panel goes for a requested origin.
///
/// The panel keeps the requested origin when it fits. Otherwise it moves the
/// shortest distance into the work area of its monitor. A panel taller or wider
/// than the work area aligns to the top-left inset. `None` means no monitor is
/// available.
pub(crate) fn resolve_floating_bounds(
    requested_origin: (i32, i32),
    logical_width: f64,
    logical_height: f64,
    monitors: &[MonitorArea],
) -> Option<PhysicalRect> {
    let monitor = choose_monitor(monitors, requested_origin, logical_width, logical_height)?;
    Some(bounds_on(
        monitor,
        requested_origin,
        logical_width,
        logical_height,
    ))
}

/// The panel at `origin`, sized for and clamped into `monitor`'s work area.
fn bounds_on(
    monitor: MonitorArea,
    origin: (i32, i32),
    logical_width: f64,
    logical_height: f64,
) -> PhysicalRect {
    let scale = sanitized_scale(monitor.scale_factor);
    let (width, height) = physical_panel_size(logical_width, logical_height, scale);
    let inset = (FLOATING_EDGE_INSET_LOGICAL * scale).round() as i32;
    let area = monitor.work_area;
    PhysicalRect {
        x: clamp_axis(origin.0, area.x, area.width, width, inset),
        y: clamp_axis(origin.1, area.y, area.height, height, inset),
        width,
        height,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NudgeAxis {
    Horizontal,
    Vertical,
}

/// The nearest work area past `from`'s edge in the nudge direction that
/// shares part of the panel's span on the other axis.
fn adjacent_monitor(
    monitors: &[MonitorArea],
    from: &PhysicalRect,
    panel: &PhysicalRect,
    axis: NudgeAxis,
    forward: bool,
) -> Option<MonitorArea> {
    let span = |start: i32, length: u32| (i64::from(start), i64::from(start) + i64::from(length));
    monitors
        .iter()
        .copied()
        .filter_map(|monitor| {
            let area = monitor.work_area;
            let (gap, overlap) = match axis {
                NudgeAxis::Horizontal => {
                    let gap = if forward {
                        i64::from(area.x) - from.right()
                    } else {
                        i64::from(from.x) - area.right()
                    };
                    let (a0, a1) = span(area.y, area.height);
                    let (p0, p1) = span(panel.y, panel.height);
                    (gap, a1.min(p1) - a0.max(p0))
                }
                NudgeAxis::Vertical => {
                    let gap = if forward {
                        i64::from(area.y) - from.bottom()
                    } else {
                        i64::from(from.y) - area.bottom()
                    };
                    let (a0, a1) = span(area.x, area.width);
                    let (p0, p1) = span(panel.x, panel.width);
                    (gap, a1.min(p1) - a0.max(p0))
                }
            };
            (gap >= 0 && overlap > 0).then_some((gap, std::cmp::Reverse(overlap), monitor))
        })
        .min_by_key(|(gap, overlap, _)| (*gap, *overlap))
        .map(|(_, _, monitor)| monitor)
}

/// Where the panel goes after a keyboard nudge of `logical_delta` from
/// `current_origin`.
///
/// The panel moves within its work area and stops at the edge. A further
/// nudge into that edge moves it fully onto the adjacent work area in that
/// direction, if there is one. A diagonal delta uses its larger axis.
pub(crate) fn resolve_nudged_bounds(
    current_origin: (i32, i32),
    logical_delta: (f64, f64),
    logical_width: f64,
    logical_height: f64,
    monitors: &[MonitorArea],
) -> Option<PhysicalRect> {
    let current = choose_monitor(monitors, current_origin, logical_width, logical_height)?;
    let here = bounds_on(current, current_origin, logical_width, logical_height);
    let requested = nudged_origin(current_origin, logical_delta, current.scale_factor);
    let moved = bounds_on(current, requested, logical_width, logical_height);

    let (axis, delta) = if logical_delta.0.abs() >= logical_delta.1.abs() {
        (NudgeAxis::Horizontal, logical_delta.0)
    } else {
        (NudgeAxis::Vertical, logical_delta.1)
    };
    let blocked = match axis {
        NudgeAxis::Horizontal => moved.x == here.x && requested.0 != here.x,
        NudgeAxis::Vertical => moved.y == here.y && requested.1 != here.y,
    };
    if delta == 0.0 || !blocked {
        return Some(moved);
    }

    let forward = delta > 0.0;
    let Some(next) = adjacent_monitor(monitors, &current.work_area, &here, axis, forward) else {
        return Some(moved);
    };
    // An extreme origin on the nudge axis clamps to the near edge of `next`.
    let near_edge = if forward { i32::MIN } else { i32::MAX };
    let origin = match axis {
        NudgeAxis::Horizontal => (near_edge, here.y),
        NudgeAxis::Vertical => (here.x, near_edge),
    };
    Some(bounds_on(next, origin, logical_width, logical_height))
}

/// The origin after a keyboard nudge of `(dx, dy)` logical px on a monitor
/// with `scale_factor`.
fn nudged_origin(
    current_origin: (i32, i32),
    logical_delta: (f64, f64),
    scale_factor: f64,
) -> (i32, i32) {
    let scale = sanitized_scale(scale_factor);
    let step = |value: i32, delta: f64| -> i32 {
        let moved = f64::from(value) + (delta * scale).round();
        moved.clamp(f64::from(i32::MIN), f64::from(i32::MAX)) as i32
    };
    (
        step(current_origin.0, logical_delta.0),
        step(current_origin.1, logical_delta.1),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect {
        PhysicalRect {
            x,
            y,
            width,
            height,
        }
    }

    fn monitor(x: i32, y: i32, width: u32, height: u32, scale_factor: f64) -> MonitorArea {
        MonitorArea {
            work_area: rect(x, y, width, height),
            scale_factor,
        }
    }

    /// Primary 1920x1040 work area at 100%, a 150% monitor to the left with a
    /// negative origin, and a 125% monitor above.
    fn mixed_layout() -> Vec<MonitorArea> {
        vec![
            monitor(0, 0, 1920, 1040, 1.0),
            monitor(-2560, -200, 2560, 1380, 1.5),
            monitor(0, -1440, 2560, 1392, 1.25),
        ]
    }

    #[test]
    fn origin_that_fits_is_kept() {
        let bounds = resolve_floating_bounds((600, 300), 400.0, 500.0, &mixed_layout());
        assert_eq!(bounds, Some(rect(600, 300, 400, 500)));
    }

    #[test]
    fn negative_origin_monitor_keeps_its_position_and_uses_its_scale() {
        let bounds = resolve_floating_bounds((-2000, -100), 400.0, 500.0, &mixed_layout());
        assert_eq!(bounds, Some(rect(-2000, -100, 600, 750)));
    }

    #[test]
    fn panel_past_the_left_edge_of_a_negative_monitor_is_clamped_inside() {
        let bounds = resolve_floating_bounds((-2700, -400), 400.0, 500.0, &mixed_layout());
        // 8 logical px inset at 150% is 12 physical px.
        assert_eq!(bounds, Some(rect(-2548, -188, 600, 750)));
    }

    #[test]
    fn panel_on_a_monitor_above_the_primary_uses_negative_y() {
        let bounds = resolve_floating_bounds((2400, -1300), 400.0, 500.0, &mixed_layout());
        // 400x500 logical at 125% is 500x625; inset is 10 px.
        assert_eq!(bounds, Some(rect(2050, -1300, 500, 625)));
    }

    #[test]
    fn panel_straddling_two_monitors_belongs_to_the_one_it_overlaps_most() {
        // Mostly on the left monitor, a little on the primary.
        let bounds = resolve_floating_bounds((-500, 200), 400.0, 500.0, &mixed_layout());
        assert_eq!(bounds, Some(rect(-612, 200, 600, 750)));
    }

    #[test]
    fn removed_monitor_moves_panel_to_the_nearest_remaining_work_area() {
        // The panel was on a monitor right of the primary that is now gone.
        let bounds = resolve_floating_bounds((3000, 200), 400.0, 500.0, &mixed_layout());
        assert_eq!(bounds, Some(rect(1512, 200, 400, 500)));
    }

    #[test]
    fn removed_negative_monitor_moves_panel_to_the_primary() {
        let only_primary = vec![monitor(0, 0, 1920, 1040, 1.0)];
        let bounds = resolve_floating_bounds((-2000, -100), 400.0, 500.0, &only_primary);
        assert_eq!(bounds, Some(rect(8, 8, 400, 500)));
    }

    #[test]
    fn lower_resolution_clamps_panel_back_into_the_smaller_work_area() {
        let after_resolution_change = vec![monitor(0, 0, 1280, 680, 1.0)];
        let bounds = resolve_floating_bounds((1500, 600), 400.0, 500.0, &after_resolution_change);
        assert_eq!(bounds, Some(rect(872, 172, 400, 500)));
    }

    #[test]
    fn higher_dpi_grows_the_panel_and_keeps_it_inside() {
        let at_100 = vec![monitor(0, 0, 1920, 1040, 1.0)];
        let at_200 = vec![monitor(0, 0, 1920, 1040, 2.0)];
        assert_eq!(
            resolve_floating_bounds((1500, 500), 400.0, 500.0, &at_100),
            Some(rect(1500, 500, 400, 500))
        );
        assert_eq!(
            resolve_floating_bounds((1500, 500), 400.0, 500.0, &at_200),
            Some(rect(1104, 24, 800, 1000))
        );
    }

    #[test]
    fn panel_taller_than_work_area_aligns_to_the_top_inset() {
        let short = vec![monitor(0, 0, 1920, 400, 1.0)];
        let bounds = resolve_floating_bounds((100, 100), 400.0, 500.0, &short);
        assert_eq!(bounds, Some(rect(100, 8, 400, 500)));
    }

    #[test]
    fn fractional_scale_rounds_size_up() {
        let at_175 = vec![monitor(0, 0, 3840, 2100, 1.75)];
        let bounds = resolve_floating_bounds((100, 100), 400.0, 333.0, &at_175);
        assert_eq!(bounds, Some(rect(100, 100, 700, 583)));
    }

    #[test]
    fn no_monitors_means_no_floating_bounds() {
        assert_eq!(resolve_floating_bounds((0, 0), 400.0, 500.0, &[]), None);
    }

    #[test]
    fn invalid_scale_is_treated_as_100_percent() {
        let broken = vec![monitor(0, 0, 1920, 1040, 0.0)];
        assert_eq!(
            resolve_floating_bounds((50, 50), 400.0, 500.0, &broken),
            Some(rect(50, 50, 400, 500))
        );
    }

    /// Primary at 100% and a 150% monitor directly to its right.
    fn side_by_side() -> Vec<MonitorArea> {
        vec![
            monitor(0, 0, 1920, 1040, 1.0),
            monitor(1920, 0, 2560, 1400, 1.5),
        ]
    }

    #[test]
    fn nudge_moves_within_the_work_area_and_stops_at_the_edge() {
        let monitors = side_by_side();
        assert_eq!(
            resolve_nudged_bounds((1400, 200), (10.0, 0.0), 400.0, 500.0, &monitors),
            Some(rect(1410, 200, 400, 500))
        );
        // A step past the edge stops at the edge first; it does not jump.
        assert_eq!(
            resolve_nudged_bounds((1500, 200), (50.0, 0.0), 400.0, 500.0, &monitors),
            Some(rect(1512, 200, 400, 500))
        );
    }

    #[test]
    fn nudge_at_the_edge_crosses_onto_the_adjacent_monitor_and_back() {
        let monitors = side_by_side();
        let right = resolve_nudged_bounds((1512, 200), (10.0, 0.0), 400.0, 500.0, &monitors);
        // Fully on the 150% monitor: 12 px inset, 600x750 size.
        assert_eq!(right, Some(rect(1932, 200, 600, 750)));

        let back = resolve_nudged_bounds((1932, 200), (-10.0, 0.0), 400.0, 500.0, &monitors);
        assert_eq!(back, Some(rect(1512, 200, 400, 500)));
    }

    #[test]
    fn nudge_left_crosses_onto_a_negative_origin_monitor() {
        let monitors = vec![
            monitor(0, 0, 1920, 1040, 1.0),
            monitor(-2560, -200, 2560, 1380, 1.5),
        ];
        assert_eq!(
            resolve_nudged_bounds((8, 300), (-10.0, 0.0), 400.0, 500.0, &monitors),
            Some(rect(-612, 300, 600, 750))
        );
    }

    #[test]
    fn nudge_up_crosses_onto_a_monitor_above() {
        assert_eq!(
            resolve_nudged_bounds((100, 8), (0.0, -10.0), 400.0, 500.0, &mixed_layout()),
            Some(rect(100, -683, 500, 625))
        );
    }

    #[test]
    fn nudge_at_an_outer_edge_without_a_neighbor_stays_put() {
        let monitors = side_by_side();
        assert_eq!(
            resolve_nudged_bounds((8, 200), (-10.0, 0.0), 400.0, 500.0, &monitors),
            Some(rect(8, 200, 400, 500))
        );
        // The right monitor does not span this far down, so it is no neighbor.
        let short_right = vec![
            monitor(0, 0, 1920, 1040, 1.0),
            monitor(1920, 0, 1920, 300, 1.0),
        ];
        assert_eq!(
            resolve_nudged_bounds((1512, 532), (10.0, 0.0), 400.0, 500.0, &short_right),
            Some(rect(1512, 532, 400, 500))
        );
    }

    #[test]
    fn nudge_scales_logical_steps_to_physical_pixels() {
        assert_eq!(nudged_origin((100, 100), (10.0, -10.0), 1.5), (115, 85));
        assert_eq!(
            nudged_origin((-2000, -100), (-50.0, 0.0), 1.0),
            (-2050, -100)
        );
    }
}
