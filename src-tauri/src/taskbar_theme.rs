//! Windows taskbar theme. The taskbar follows the Windows mode
//! (`SystemUsesLightTheme`), not the app mode that the webview reports.

use serde::Serialize;

pub(crate) const TASKBAR_THEME_EVENT: &str = "taskbar-theme-changed";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TaskbarTheme {
    Light,
    Dark,
}

/// Maps the `SystemUsesLightTheme` DWORD. Windows draws a dark taskbar when the
/// value does not exist, so `None` is dark.
pub(crate) fn theme_from_system_uses_light_theme(value: Option<u32>) -> TaskbarTheme {
    match value {
        Some(0) | None => TaskbarTheme::Dark,
        Some(_) => TaskbarTheme::Light,
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{TASKBAR_THEME_EVENT, TaskbarTheme, theme_from_system_uses_light_theme};
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, KEY_QUERY_VALUE, REG_NOTIFY_CHANGE_LAST_SET,
        RRF_RT_REG_DWORD, RegCloseKey, RegGetValueW, RegNotifyChangeKeyValue, RegOpenKeyExW,
    };

    const PERSONALIZE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    const VALUE_NAME: &str = "SystemUsesLightTheme";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn read_from(root: HKEY, subkey: Option<&[u16]>) -> Result<TaskbarTheme, String> {
        let value_name = wide(VALUE_NAME);
        let mut data: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        // SAFETY: all pointers are valid for the duration of the call, and
        // `size` matches the DWORD buffer.
        let status = unsafe {
            RegGetValueW(
                root,
                subkey.map_or(std::ptr::null(), |key| key.as_ptr()),
                value_name.as_ptr(),
                RRF_RT_REG_DWORD,
                std::ptr::null_mut(),
                (&mut data as *mut u32).cast(),
                &mut size,
            )
        };
        match status {
            ERROR_SUCCESS => Ok(theme_from_system_uses_light_theme(Some(data))),
            ERROR_FILE_NOT_FOUND => Ok(theme_from_system_uses_light_theme(None)),
            code => Err(format!("Could not read {VALUE_NAME} (error {code})")),
        }
    }

    pub(crate) fn read() -> Result<TaskbarTheme, String> {
        read_from(HKEY_CURRENT_USER, Some(&wide(PERSONALIZE_KEY)))
    }

    /// Blocks on registry change notifications and emits each theme change.
    pub(crate) fn watch(app: AppHandle) {
        std::thread::spawn(move || {
            let subkey = wide(PERSONALIZE_KEY);
            let mut key: HKEY = std::ptr::null_mut();
            // SAFETY: `subkey` is NUL-terminated and `key` receives the handle.
            let status = unsafe {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    subkey.as_ptr(),
                    0,
                    KEY_NOTIFY | KEY_QUERY_VALUE,
                    &mut key,
                )
            };
            if status != ERROR_SUCCESS {
                log::error!("Could not watch the taskbar theme (error {status})");
                return;
            }
            let mut last = read_from(key, None).ok();
            loop {
                // SAFETY: `key` is an open handle; the call blocks until a value changes.
                let status = unsafe {
                    RegNotifyChangeKeyValue(
                        key,
                        0,
                        REG_NOTIFY_CHANGE_LAST_SET,
                        std::ptr::null_mut(),
                        0,
                    )
                };
                if status != ERROR_SUCCESS {
                    log::error!("Taskbar theme watch stopped (error {status})");
                    break;
                }
                match read_from(key, None) {
                    Ok(theme) if Some(theme) != last => {
                        last = Some(theme);
                        if let Err(error) = app.emit(TASKBAR_THEME_EVENT, theme) {
                            log::error!("Could not emit taskbar theme change: {error}");
                        }
                    }
                    Ok(_) => {}
                    Err(error) => log::error!("{error}"),
                }
            }
            // SAFETY: `key` was opened above and is closed once.
            unsafe { RegCloseKey(key) };
        });
    }
}

#[cfg(target_os = "windows")]
pub(crate) use windows_impl::watch;

#[tauri::command]
pub(crate) fn get_taskbar_theme() -> Result<TaskbarTheme, String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::read()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("The taskbar theme is only available on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{TaskbarTheme, theme_from_system_uses_light_theme};

    #[test]
    fn maps_system_uses_light_theme_values() {
        assert_eq!(
            theme_from_system_uses_light_theme(Some(1)),
            TaskbarTheme::Light
        );
        assert_eq!(
            theme_from_system_uses_light_theme(Some(0)),
            TaskbarTheme::Dark
        );
        assert_eq!(theme_from_system_uses_light_theme(None), TaskbarTheme::Dark);
    }

    #[test]
    fn serializes_as_lowercase_for_the_frontend() {
        assert_eq!(
            serde_json::to_string(&TaskbarTheme::Light).unwrap(),
            "\"light\""
        );
        assert_eq!(
            serde_json::to_string(&TaskbarTheme::Dark).unwrap(),
            "\"dark\""
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn reads_the_current_user_taskbar_theme() {
        assert!(super::windows_impl::read().is_ok());
    }
}
