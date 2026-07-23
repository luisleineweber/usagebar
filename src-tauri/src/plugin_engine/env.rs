use std::collections::HashMap;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::GetLastError;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Security::Credentials::{
    CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC,
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(crate) fn last_non_empty_trimmed_line(text: &str) -> Option<String> {
    text.lines()
        .map(|line| line.trim())
        .rev()
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

pub(crate) fn sanitize_env_value(text: &str) -> Option<String> {
    let mut cleaned = if let Ok(ansi_re) = regex_lite::Regex::new(r"\x1B\[[0-?]*[ -/]*[@-~]") {
        ansi_re.replace_all(text, "").to_string()
    } else {
        text.to_string()
    };
    cleaned.retain(|ch| ch == '\n' || ch == '\r' || ch == '\t' || !ch.is_control());
    last_non_empty_trimmed_line(&cleaned)
}

pub(crate) fn extract_marked_value(
    text: &str,
    start_marker: &str,
    end_marker: &str,
) -> Option<String> {
    let start = text.find(start_marker)?;
    let after_start = &text[start + start_marker.len()..];
    let end = after_start.find(end_marker)?;
    sanitize_env_value(&after_start[..end])
}

pub(crate) fn parse_interactive_shell_env_output(
    text: &str,
    start_marker: &str,
    end_marker: &str,
) -> Option<String> {
    if let Some(marked) = extract_marked_value(text, start_marker, end_marker) {
        return Some(marked);
    }

    let has_complete_markers = text.contains(start_marker) && text.contains(end_marker);
    if has_complete_markers {
        return None;
    }

    sanitize_env_value(text)
}

pub(crate) fn configure_background_command(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn read_windows_generic_password_target(target: &str) -> Result<String, String> {
    let mut target_wide: Vec<u16> = OsStr::new(target).encode_wide().collect();
    target_wide.push(0);

    let mut credential_ptr: *mut CREDENTIALW = std::ptr::null_mut();
    let read_ok = unsafe {
        CredReadW(
            target_wide.as_ptr(),
            CRED_TYPE_GENERIC,
            0,
            &mut credential_ptr,
        )
    };
    if read_ok == 0 {
        return Err(format!("credential read failed: os error {}", unsafe {
            GetLastError()
        }));
    }

    let decode_result = {
        let credential = unsafe { &*credential_ptr };
        let blob_len = credential.CredentialBlobSize as usize;
        let blob = if blob_len == 0 || credential.CredentialBlob.is_null() {
            &[][..]
        } else {
            unsafe { std::slice::from_raw_parts(credential.CredentialBlob, blob_len) }
        };
        decode_windows_generic_password_blob(blob)
    };

    unsafe {
        CredFree(credential_ptr as *mut std::ffi::c_void);
    }

    decode_result
}

#[cfg(target_os = "windows")]
pub(crate) fn decode_windows_generic_password_blob(blob: &[u8]) -> Result<String, String> {
    if blob.is_empty() {
        return Ok(String::new());
    }

    if let Ok(utf8) = String::from_utf8(blob.to_vec()) {
        let trimmed = utf8.trim_end_matches('\0').trim();
        if !trimmed.is_empty() && !trimmed.contains('\0') {
            return Ok(trimmed.to_string());
        }
    }

    if blob.len() % 2 == 0 {
        let wide: Vec<u16> = blob
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        if let Ok(utf16) = String::from_utf16(&wide) {
            let trimmed = utf16.trim_end_matches('\0').trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    Err("credential blob was not valid UTF-8 or UTF-16 text".to_string())
}

pub(crate) fn read_env_from_process(name: &str) -> Option<String> {
    let value = std::env::var(name).ok()?;
    sanitize_env_value(&value)
}

pub(crate) fn read_command_stdout(program: &str, args: &[&str]) -> Option<String> {
    let mut command = Command::new(program);
    configure_background_command(&mut command);
    let output = command.args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn terminal_env_cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn shell_from_env() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let trimmed = shell.trim();
    if trimmed.is_empty() {
        return None;
    }
    let file = std::path::Path::new(trimmed).file_name()?.to_string_lossy();
    let allowed = file == "zsh" || file == "bash" || file == "fish";
    if allowed {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn read_env_from_interactive_shell(program: &str, name: &str) -> Option<String> {
    const START_MARKER: &str = "__OPENUSAGE_ENV_START__";
    const END_MARKER: &str = "__OPENUSAGE_ENV_END__";

    let script = format!(
        "printf '{}\\n'; printenv {}; printf '{}\\n'",
        START_MARKER, name, END_MARKER
    );
    let output = read_command_stdout(program, &["-ilc", script.as_str()])?;
    parse_interactive_shell_env_output(&output, START_MARKER, END_MARKER)
}

fn read_env_from_interactive_shells(name: &str) -> Option<String> {
    let mut programs: Vec<String> = Vec::new();

    if let Some(shell) = shell_from_env() {
        programs.push(shell);
    }

    for program in [
        "/bin/zsh",
        "/bin/bash",
        "/opt/homebrew/bin/fish",
        "/usr/local/bin/fish",
        "/opt/local/bin/fish",
    ] {
        if !programs.iter().any(|p| p == program) {
            programs.push(program.to_string());
        }
    }

    for program in programs {
        if let Some(value) = read_env_from_interactive_shell(program.as_str(), name) {
            return Some(value);
        }
    }

    None
}

pub(crate) fn resolve_env_value(name: &str) -> Option<String> {
    if let Some(value) = read_env_from_process(name) {
        return Some(value);
    }

    if let Ok(cache) = terminal_env_cache().lock() {
        if let Some(cached) = cache.get(name) {
            return cached.clone();
        }
    }

    let resolved = read_env_from_interactive_shells(name);
    if let Ok(mut cache) = terminal_env_cache().lock() {
        cache.insert(name.to_string(), resolved.clone());
    }
    resolved
}
