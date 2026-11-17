//! Native signals for the movable tray panel.
//!
//! Windows runs a modal move loop (`WM_ENTERSIZEMOVE` .. `WM_EXITSIZEMOVE`)
//! only for user moves, never for `SetWindowPos`. A subclass on the panel
//! window records where each user move ends, so the panel's own re-anchoring
//! cannot be mistaken for a user move. The subclass also reports display,
//! DPI, and work-area changes so a floating panel can return on screen.

use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum PanelWindowSignal {
    /// A user move loop ended with the window at this physical origin.
    UserMoveEnded { x: i32, y: i32 },
    /// Monitors, resolution, DPI, or the work area changed.
    DisplayChanged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowOrigin {
    x: i32,
    y: i32,
}

/// The signal for one completed move loop: none when the window did not move.
fn signal_after_move(start: WindowOrigin, end: WindowOrigin) -> Option<PanelWindowSignal> {
    (start != end).then_some(PanelWindowSignal::UserMoveEnded { x: end.x, y: end.y })
}

static MOVE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static SIGNAL_HANDLER: OnceLock<fn(PanelWindowSignal)> = OnceLock::new();

/// Whether the user is dragging the panel right now. Programmatic placement
/// must not move the window during a drag.
pub(crate) fn user_move_in_progress() -> bool {
    MOVE_IN_PROGRESS.load(Ordering::SeqCst)
}

fn dispatch(signal: PanelWindowSignal) {
    if let Some(handler) = SIGNAL_HANDLER.get() {
        handler(signal);
    }
}

#[cfg(target_os = "windows")]
mod native {
    use super::*;
    use std::sync::Mutex;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, SPI_SETWORKAREA, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_ENTERSIZEMOVE,
        WM_EXITSIZEMOVE, WM_NCDESTROY, WM_SETTINGCHANGE,
    };

    const SUBCLASS_ID: usize = 0x5553_4250; // "USBP"

    static MOVE_START: Mutex<Option<WindowOrigin>> = Mutex::new(None);

    fn window_origin(hwnd: HWND) -> Option<WindowOrigin> {
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        // SAFETY: `hwnd` is the live window this subclass is attached to and
        // `rect` is a caller-owned out-parameter.
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            return None;
        }
        Some(WindowOrigin {
            x: rect.left,
            y: rect.top,
        })
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        match msg {
            WM_ENTERSIZEMOVE => {
                MOVE_IN_PROGRESS.store(true, Ordering::SeqCst);
                if let Ok(mut start) = MOVE_START.lock() {
                    *start = window_origin(hwnd);
                }
            }
            WM_EXITSIZEMOVE => {
                MOVE_IN_PROGRESS.store(false, Ordering::SeqCst);
                let start = MOVE_START.lock().ok().and_then(|mut start| start.take());
                if let (Some(start), Some(end)) = (start, window_origin(hwnd))
                    && let Some(signal) = signal_after_move(start, end)
                {
                    dispatch(signal);
                }
            }
            WM_DISPLAYCHANGE | WM_DPICHANGED => dispatch(PanelWindowSignal::DisplayChanged),
            WM_SETTINGCHANGE if wparam == SPI_SETWORKAREA as usize => {
                dispatch(PanelWindowSignal::DisplayChanged)
            }
            WM_NCDESTROY => {
                MOVE_IN_PROGRESS.store(false, Ordering::SeqCst);
                // SAFETY: removes this subclass from the window being
                // destroyed, on its owning thread.
                unsafe {
                    RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
                }
            }
            _ => {}
        }
        // SAFETY: forwards the message this subclass received, unchanged.
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    pub(super) fn install(hwnd: HWND) -> bool {
        // SAFETY: called on the thread that owns `hwnd`; the subclass
        // procedure is `'static` and forwards every message.
        unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0) != 0 }
    }
}

/// Start reporting user moves and display changes of the panel window to
/// `handler`. Call once; later calls keep the first handler.
#[cfg(target_os = "windows")]
pub(crate) fn install(window: &tauri::WebviewWindow, handler: fn(PanelWindowSignal)) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    if SIGNAL_HANDLER.set(handler).is_err() {
        return;
    }
    let hwnd = match window.window_handle().map(|handle| handle.as_raw()) {
        Ok(RawWindowHandle::Win32(handle)) => handle.hwnd.get(),
        _ => {
            log::error!(
                "panel move tracking: no Win32 window handle; moves will not be remembered"
            );
            return;
        }
    };
    let scheduled = window.run_on_main_thread(move || {
        if !native::install(hwnd as _) {
            log::error!("panel move tracking: SetWindowSubclass failed");
        }
    });
    if let Err(error) = scheduled {
        log::error!("panel move tracking: could not schedule install: {error}");
    }
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn install(_window: &tauri::WebviewWindow, handler: fn(PanelWindowSignal)) {
    let _ = SIGNAL_HANDLER.set(handler);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_drag_reports_where_the_panel_landed() {
        assert_eq!(
            signal_after_move(
                WindowOrigin { x: 1500, y: 500 },
                WindowOrigin { x: -2000, y: -100 }
            ),
            Some(PanelWindowSignal::UserMoveEnded { x: -2000, y: -100 })
        );
    }

    #[test]
    fn a_drag_that_ends_where_it_started_reports_nothing() {
        assert_eq!(
            signal_after_move(
                WindowOrigin { x: 400, y: 200 },
                WindowOrigin { x: 400, y: 200 }
            ),
            None
        );
    }
}
