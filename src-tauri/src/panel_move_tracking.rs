//! Native signals for the movable tray panel.
//!
//! Windows runs a modal move loop (`WM_ENTERSIZEMOVE` .. `WM_EXITSIZEMOVE`)
//! only for user moves, never for `SetWindowPos`. A subclass on the panel
//! window records where each user move ends, so the panel's own re-anchoring
//! cannot be mistaken for a user move. The subclass also reports display,
//! DPI, and work-area changes so a floating panel can return on screen.
//!
//! Signals are never handled inside the message that caused them. This
//! subclass runs before tao's window procedure, and Tauri runs main-thread
//! tasks inline when called on the main thread. So the subclass posts a
//! private message and handles the signal when that message arrives. By then
//! tao has applied the suggested rect of `WM_DPICHANGED` and cannot overwrite
//! the placement.

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

const SIGNAL_KIND_MOVE_ENDED: usize = 1;
const SIGNAL_KIND_DISPLAY_CHANGED: usize = 2;

/// Pack a signal into the `(wparam, lparam)` of the private message.
fn encode_signal(signal: PanelWindowSignal) -> (usize, isize) {
    match signal {
        PanelWindowSignal::UserMoveEnded { x, y } => {
            let packed = (u64::from(x as u32) << 32) | u64::from(y as u32);
            (SIGNAL_KIND_MOVE_ENDED, packed as i64 as isize)
        }
        PanelWindowSignal::DisplayChanged => (SIGNAL_KIND_DISPLAY_CHANGED, 0),
    }
}

fn decode_signal(wparam: usize, lparam: isize) -> Option<PanelWindowSignal> {
    match wparam {
        SIGNAL_KIND_MOVE_ENDED => {
            let packed = lparam as i64 as u64;
            Some(PanelWindowSignal::UserMoveEnded {
                x: (packed >> 32) as u32 as i32,
                y: packed as u32 as i32,
            })
        }
        SIGNAL_KIND_DISPLAY_CHANGED => Some(PanelWindowSignal::DisplayChanged),
        _ => None,
    }
}

static MOVE_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static SIGNAL_HANDLER: OnceLock<fn(PanelWindowSignal)> = OnceLock::new();

/// Whether the user is dragging the panel right now. Programmatic placement
/// must not move the window during a drag.
pub(crate) fn user_move_in_progress() -> bool {
    MOVE_IN_PROGRESS.load(Ordering::SeqCst)
}

#[cfg(target_os = "windows")]
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
        GetWindowRect, PostMessageW, RegisterWindowMessageW, SPI_SETWORKAREA, WM_DISPLAYCHANGE,
        WM_DPICHANGED, WM_ENTERSIZEMOVE, WM_EXITSIZEMOVE, WM_NCDESTROY, WM_SETTINGCHANGE,
    };

    const SUBCLASS_ID: usize = 0x5553_4250; // "USBP"
    const SIGNAL_MESSAGE_NAME: &str = "UsageBar.PanelWindowSignal";

    static MOVE_START: Mutex<Option<WindowOrigin>> = Mutex::new(None);
    static SIGNAL_MESSAGE: OnceLock<u32> = OnceLock::new();

    /// The private message id, registered once. `None` if registration failed.
    pub(super) fn signal_message() -> Option<u32> {
        let id = *SIGNAL_MESSAGE.get_or_init(|| {
            let name: Vec<u16> = SIGNAL_MESSAGE_NAME
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();
            // SAFETY: `name` is a NUL-terminated UTF-16 string that outlives the call.
            unsafe { RegisterWindowMessageW(name.as_ptr()) }
        });
        (id != 0).then_some(id)
    }

    /// The display signal a window message must report later, if any.
    pub(super) fn display_signal_for(msg: u32, wparam: WPARAM) -> Option<PanelWindowSignal> {
        match msg {
            WM_DISPLAYCHANGE | WM_DPICHANGED => Some(PanelWindowSignal::DisplayChanged),
            WM_SETTINGCHANGE if wparam == SPI_SETWORKAREA as usize => {
                Some(PanelWindowSignal::DisplayChanged)
            }
            _ => None,
        }
    }

    /// Queue `signal` behind the current message instead of handling it now.
    fn post_signal(hwnd: HWND, signal: PanelWindowSignal) {
        let Some(message) = signal_message() else {
            return;
        };
        let (wparam, lparam) = encode_signal(signal);
        // SAFETY: posts to the live window this subclass is attached to.
        if unsafe { PostMessageW(hwnd, message, wparam, lparam) } == 0 {
            log::error!("panel move tracking: could not post a window signal");
        }
    }

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
        if Some(msg) == signal_message() {
            if let Some(signal) = decode_signal(wparam, lparam) {
                dispatch(signal);
            }
            return 0;
        }
        if let Some(signal) = display_signal_for(msg, wparam) {
            post_signal(hwnd, signal);
        }
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
                    post_signal(hwnd, signal);
                }
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
/// `handler`. Call once; later calls keep the first handler. The movable
/// panel is Windows-only, so other platforms install nothing.
#[cfg(target_os = "windows")]
pub(crate) fn install(window: &tauri::WebviewWindow, handler: fn(PanelWindowSignal)) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};

    if SIGNAL_HANDLER.set(handler).is_err() {
        return;
    }
    if native::signal_message().is_none() {
        log::error!(
            "panel move tracking: RegisterWindowMessageW failed; moves will not be remembered"
        );
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

    #[test]
    fn posted_signals_round_trip_with_negative_origins() {
        for signal in [
            PanelWindowSignal::UserMoveEnded { x: -2548, y: -188 },
            PanelWindowSignal::UserMoveEnded {
                x: i32::MIN,
                y: i32::MAX,
            },
            PanelWindowSignal::UserMoveEnded { x: 1500, y: 0 },
            PanelWindowSignal::DisplayChanged,
        ] {
            let (wparam, lparam) = encode_signal(signal);
            assert_eq!(decode_signal(wparam, lparam), Some(signal));
        }
    }

    #[test]
    fn unknown_private_message_kinds_are_ignored() {
        assert_eq!(decode_signal(0, 0), None);
        assert_eq!(decode_signal(99, 7), None);
    }

    /// Regression: `WM_DPICHANGED` must be handled after tao applies its
    /// suggested rect, so display messages are queued, never handled inline.
    #[cfg(target_os = "windows")]
    #[test]
    fn display_messages_are_deferred_through_a_private_message() {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SPI_SETWORKAREA, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_MOVE, WM_SETTINGCHANGE,
        };
        for (msg, wparam) in [
            (WM_DPICHANGED, 0),
            (WM_DISPLAYCHANGE, 0),
            (WM_SETTINGCHANGE, SPI_SETWORKAREA as usize),
        ] {
            assert_eq!(
                native::display_signal_for(msg, wparam),
                Some(PanelWindowSignal::DisplayChanged)
            );
        }
        assert_eq!(native::display_signal_for(WM_SETTINGCHANGE, 0), None);
        assert_eq!(native::display_signal_for(WM_MOVE, 0), None);
        let private = native::signal_message().expect("private message registers");
        assert!(
            private >= 0xC000,
            "registered messages use the 0xC000..=0xFFFF range"
        );
    }
}
