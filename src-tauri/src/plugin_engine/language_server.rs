use crate::plugin_engine::env::configure_background_command;
use rquickjs::{Ctx, Exception, Function, Object};
use std::process::Command;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LsDiscoverOpts {
    process_name: String,
    markers: Vec<String>,
    csrf_flag: String,
    port_flag: Option<String>,
    extra_flags: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LsDiscoverResult {
    pid: i32,
    csrf: String,
    ports: Vec<i32>,
    extra: std::collections::HashMap<String, String>,
    extension_port: Option<i32>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsProcessEntry {
    process_id: i32,
    command_line: Option<String>,
}

fn list_processes() -> std::io::Result<Vec<(i32, String)>> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell");
        configure_background_command(&mut command);
        let output = command
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
            ])
            .output()?;

        if !output.status.success() {
            return Ok(Vec::new());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let trimmed = stdout.trim();
        if trimmed.is_empty() || trimmed == "null" {
            return Ok(Vec::new());
        }

        let mut processes = Vec::new();
        if trimmed.starts_with('[') {
            let rows: Vec<WindowsProcessEntry> = serde_json::from_str(trimmed).unwrap_or_default();
            for row in rows {
                if let Some(command) = row.command_line {
                    let command = command.trim();
                    if !command.is_empty() {
                        processes.push((row.process_id, command.to_string()));
                    }
                }
            }
        } else if trimmed.starts_with('{') {
            if let Ok(row) = serde_json::from_str::<WindowsProcessEntry>(trimmed) {
                if let Some(command) = row.command_line {
                    let command = command.trim();
                    if !command.is_empty() {
                        processes.push((row.process_id, command.to_string()));
                    }
                }
            }
        }

        Ok(processes)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let ps_output = Command::new("/bin/ps")
            .args(["-ax", "-o", "pid=,command="])
            .output()?;

        if !ps_output.status.success() {
            return Ok(Vec::new());
        }

        let ps_stdout = String::from_utf8_lossy(&ps_output.stdout);
        let mut processes = Vec::new();
        for line in ps_stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let mut parts = trimmed.splitn(2, char::is_whitespace);
            let pid_str = match parts.next() {
                Some(value) => value.trim(),
                None => continue,
            };
            let command = match parts.next() {
                Some(value) => value.trim(),
                None => continue,
            };

            if let Ok(pid) = pid_str.parse::<i32>() {
                processes.push((pid, command.to_string()));
            }
        }
        Ok(processes)
    }
}

fn listening_ports(process_pid: i32) -> std::io::Result<Vec<i32>> {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("netstat");
        configure_background_command(&mut command);
        let output = command.args(["-ano", "-p", "tcp"]).output()?;
        if !output.status.success() {
            return Ok(Vec::new());
        }
        Ok(parse_netstat_ports(
            &String::from_utf8_lossy(&output.stdout),
            process_pid,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let lsof_path = ["/usr/sbin/lsof", "/usr/bin/lsof"]
            .iter()
            .find(|path| std::path::Path::new(path).exists())
            .copied();

        if let Some(lsof) = lsof_path {
            match Command::new(lsof)
                .args([
                    "-nP",
                    "-iTCP",
                    "-sTCP:LISTEN",
                    "-a",
                    "-p",
                    &process_pid.to_string(),
                ])
                .output()
            {
                Ok(output) if output.status.success() => {
                    return Ok(parse_lsof_ports(&String::from_utf8_lossy(&output.stdout)));
                }
                Ok(_) => return Ok(Vec::new()),
                Err(error) => return Err(error),
            }
        }

        Ok(Vec::new())
    }
}

pub(crate) fn inject_ls<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
) -> rquickjs::Result<()> {
    let ls_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    ls_obj.set(
        "_discoverRaw",
        Function::new(
            ctx.clone(),
            move |ctx_inner: Ctx<'_>, opts_json: String| -> rquickjs::Result<String> {
                let opts: LsDiscoverOpts = serde_json::from_str(&opts_json).map_err(|error| {
                    Exception::throw_message(
                        &ctx_inner,
                        &format!("invalid discover opts: {}", error),
                    )
                })?;

                log::info!(
                    "[plugin:{}] LS discover: processName={}, markers={:?}",
                    pid,
                    opts.process_name,
                    opts.markers
                );

                let process_rows = match list_processes() {
                    Ok(rows) => rows,
                    Err(error) => {
                        log::warn!("[plugin:{}] process listing failed: {}", pid, error);
                        return Ok("null".to_string());
                    }
                };

                if process_rows.is_empty() {
                    log::warn!("[plugin:{}] process listing returned no rows", pid);
                    return Ok("null".to_string());
                }

                let process_name_lower = opts.process_name.to_lowercase();
                let markers_lower: Vec<String> = opts
                    .markers
                    .iter()
                    .map(|marker| marker.to_lowercase())
                    .collect();
                let mut found: Option<(i32, String)> = None;

                for (row_pid, command) in process_rows.iter() {
                    let command = command.trim();
                    if command.is_empty() {
                        continue;
                    }

                    let command_lower = command.to_lowercase();
                    if !command_lower.contains(&process_name_lower) {
                        continue;
                    }

                    let ide_name =
                        extract_flag(command, "--ide_name").map(|value| value.to_lowercase());
                    let app_data =
                        extract_flag(command, "--app_data_dir").map(|value| value.to_lowercase());
                    let has_marker = markers_lower.iter().any(|marker| {
                        if let Some(ref name) = ide_name {
                            return *name == *marker;
                        }
                        if let Some(ref directory) = app_data {
                            return *directory == *marker;
                        }
                        let slash = format!("/{}/", marker);
                        let backslash = format!("\\{}\\", marker);
                        command_lower.contains(&slash)
                            || command_lower.contains(&backslash)
                            || command_lower.contains(marker)
                    });
                    if has_marker {
                        found = Some((*row_pid, command.to_string()));
                        break;
                    }
                }

                let (process_pid, command) = match found {
                    Some(pair) => pair,
                    None => {
                        log::info!("[plugin:{}] LS process not found", pid);
                        return Ok("null".to_string());
                    }
                };

                let csrf = match extract_flag(&command, &opts.csrf_flag) {
                    Some(value) => value,
                    None => {
                        log::warn!("[plugin:{}] CSRF token not found in process args", pid);
                        return Ok("null".to_string());
                    }
                };
                let extension_port = opts.port_flag.as_ref().and_then(|flag| {
                    extract_flag(&command, flag).and_then(|value| value.parse::<i32>().ok())
                });

                let mut extra = std::collections::HashMap::new();
                if let Some(ref flags) = opts.extra_flags {
                    for flag in flags {
                        if let Some(value) = extract_flag(&command, flag) {
                            let key = flag.trim_start_matches('-').to_string();
                            extra.insert(key, value);
                        }
                    }
                }

                let ports = match listening_ports(process_pid) {
                    Ok(ports) => ports,
                    Err(error) => {
                        log::warn!(
                            "[plugin:{}] failed to enumerate listening ports for pid {}: {}",
                            pid,
                            process_pid,
                            error
                        );
                        Vec::new()
                    }
                };

                if ports.is_empty() && extension_port.is_none() {
                    log::warn!(
                        "[plugin:{}] no listening ports found for pid {}",
                        pid,
                        process_pid
                    );
                    return Ok("null".to_string());
                }

                log::info!(
                    "[plugin:{}] LS found: pid={}, ports={:?}, csrf=[REDACTED]",
                    pid,
                    process_pid,
                    ports
                );

                let result = LsDiscoverResult {
                    pid: process_pid,
                    csrf,
                    ports,
                    extra,
                    extension_port,
                };

                serde_json::to_string(&result).map_err(|error| {
                    Exception::throw_message(&ctx_inner, &format!("serialize failed: {}", error))
                })
            },
        )?,
    )?;

    host.set("ls", ls_obj)?;
    Ok(())
}

pub(crate) fn patch_ls_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            if (!__openusage_ctx.host.ls || !__openusage_ctx.host.ls._discoverRaw) return;
            var rawFn = __openusage_ctx.host.ls._discoverRaw;
            __openusage_ctx.host.ls.discover = function(opts) {
                var optsJson;
                try { optsJson = JSON.stringify(opts); } catch (e) { return null; }
                var json = rawFn(optsJson);
                if (json === "null") return null;
                return JSON.parse(json);
            };
        })();
        "#
        .as_bytes(),
    )
}

/// Extract value of a CLI flag from a command string.
/// Handles both `--flag value` and `--flag=value` forms.
fn extract_flag(command: &str, flag: &str) -> Option<String> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    let flag_eq = format!("{}=", flag);
    for (index, part) in parts.iter().enumerate() {
        if *part == flag {
            if index + 1 < parts.len() {
                return Some(parts[index + 1].to_string());
            }
        } else if part.starts_with(&flag_eq) {
            return Some(part[flag_eq.len()..].to_string());
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn parse_lsof_ports(output: &str) -> Vec<i32> {
    let mut ports = std::collections::BTreeSet::new();
    for line in output.lines() {
        if !line.contains("LISTEN") {
            continue;
        }
        for token in line.split_whitespace().rev() {
            if let Some(colon_pos) = token.rfind(':') {
                if let Ok(port) = token[colon_pos + 1..].parse::<i32>() {
                    if port > 0 && port < 65536 {
                        ports.insert(port);
                        break;
                    }
                }
            }
        }
    }
    ports.into_iter().collect()
}

pub(crate) fn parse_netstat_ports(output: &str, process_pid: i32) -> Vec<i32> {
    let mut ports = std::collections::BTreeSet::new();
    let pid_text = process_pid.to_string();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || !trimmed.starts_with("TCP") {
            continue;
        }

        let columns: Vec<&str> = trimmed.split_whitespace().collect();
        if columns.len() < 5 {
            continue;
        }

        let pid_index = columns.len() - 1;
        let foreign_address = columns[2];
        let is_listen_row = foreign_address == "0.0.0.0:0" || foreign_address == "[::]:0";
        if columns[pid_index] != pid_text || !is_listen_row {
            continue;
        }

        if let Some(port_text) = columns[1].rsplit(':').next() {
            if let Ok(port) = port_text.trim().parse::<i32>() {
                if port > 0 && port < 65536 {
                    ports.insert(port);
                }
            }
        }
    }

    ports.into_iter().collect()
}
