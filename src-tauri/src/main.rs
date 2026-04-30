// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(all(target_os = "windows", not(debug_assertions)))]
struct ReleaseSingleInstanceGuard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(all(target_os = "windows", not(debug_assertions)))]
impl Drop for ReleaseSingleInstanceGuard {
    fn drop(&mut self) {
        if self.0.is_null() {
            return;
        }

        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn is_released_product() -> bool {
    if std::env::var_os("USAGEBAR_TAURI_DEV").is_some() {
        return false;
    }

    let conf: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri.conf.json");
    conf["productName"].as_str() == Some("UsageBar")
}

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn acquire_release_single_instance() -> Option<ReleaseSingleInstanceGuard> {
    if !is_released_product() {
        return Some(ReleaseSingleInstanceGuard(std::ptr::null_mut()));
    }

    let name: Vec<u16> = "Local\\com.sunstory.usagebar.release-single-instance"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let handle = unsafe {
        windows_sys::Win32::System::Threading::CreateMutexW(
            std::ptr::null_mut(),
            0,
            name.as_ptr(),
        )
    };

    if handle.is_null() {
        return Some(ReleaseSingleInstanceGuard(handle));
    }

    let already_running = unsafe { windows_sys::Win32::Foundation::GetLastError() }
        == windows_sys::Win32::Foundation::ERROR_ALREADY_EXISTS;
    if already_running {
        unsafe {
            let _ = windows_sys::Win32::Foundation::CloseHandle(handle);
        }
        return None;
    }

    Some(ReleaseSingleInstanceGuard(handle))
}

fn main() {
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    let _single_instance_guard = match acquire_release_single_instance() {
        Some(guard) => guard,
        None => return,
    };

    usagebar_lib::run()
}
