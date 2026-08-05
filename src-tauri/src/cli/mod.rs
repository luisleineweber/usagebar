mod args;
mod format;

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use args::{Command, CommonArgs, ParsedArgs};
use time::OffsetDateTime;

const APP_IDENTIFIER: &str = "com.sunstory.usagebar";

#[derive(Debug, PartialEq, Eq)]
enum CliError {
    Usage(String),
    Runtime(String),
}

impl CliError {
    fn message(&self) -> &str {
        match self {
            Self::Usage(message) | Self::Runtime(message) => message,
        }
    }

    fn exit_code(&self) -> i32 {
        match self {
            Self::Usage(_) => 2,
            Self::Runtime(_) => 1,
        }
    }
}

fn app_data_dir() -> Result<PathBuf, CliError> {
    if let Some(path) = std::env::var_os("USAGEBAR_APP_DATA_DIR") {
        return Ok(PathBuf::from(path));
    }
    dirs::data_dir()
        .map(|path| path.join(APP_IDENTIFIER))
        .ok_or_else(|| {
            CliError::Runtime("could not resolve UsageBar app data directory".to_string())
        })
}

fn help() -> &'static str {
    "UsageBar cache-only CLI\n\nUSAGE:\n  usagebar-cli <COMMAND> [OPTIONS]\n\nCOMMANDS:\n  usage       Show the latest enabled provider snapshots\n  history     Show cached provider history\n  statusline  Print a single-line editor/status-bar summary\n\nOPTIONS:\n  --provider <id>  Limit output to one provider\n  --json           Emit stable JSON\n  --days <1-3650>  History window (history only, default: 30)\n  --watch <1-3600> Re-read cached data every N seconds\n  -h, --help       Show help\n  -V, --version    Show version\n\nThe CLI reads local cached state only. It never starts UsageBar or probes providers."
}

fn common_args(command: &Command) -> &CommonArgs {
    match command {
        Command::Usage(common) | Command::Statusline(common) => common,
        Command::History(history) => &history.common,
    }
}

fn execute(
    args: impl IntoIterator<Item = String>,
    app_data_dir: &Path,
    version: &str,
    now: OffsetDateTime,
) -> Result<String, CliError> {
    let parsed = args::parse(args).map_err(CliError::Usage)?;
    let command = match parsed {
        ParsedArgs::Help => return Ok(help().to_string()),
        ParsedArgs::Version => return Ok(format!("usagebar-cli {version}")),
        ParsedArgs::Command(command) => command,
    };

    let mut snapshots = crate::local_http_api::cache::read_enabled_snapshots(app_data_dir)
        .map_err(|error| CliError::Runtime(error.to_string()))?;
    if let Some(provider_id) = common_args(&command).provider.as_deref() {
        snapshots.retain(|snapshot| snapshot.provider_id == provider_id);
        if snapshots.is_empty() {
            return Err(CliError::Runtime(format!(
                "no enabled cached snapshot found for provider '{provider_id}'"
            )));
        }
    }

    match command {
        Command::Usage(common) => format::usage(&snapshots, common.json).map_err(CliError::Runtime),
        Command::History(history) => {
            format::history(&snapshots, history.days, now, history.common.json)
                .map_err(CliError::Runtime)?
                .ok_or_else(|| {
                    CliError::Runtime("no cached history matched the request".to_string())
                })
        }
        Command::Statusline(common) => {
            format::statusline(&snapshots, common.json).map_err(CliError::Runtime)
        }
    }
}

pub fn run(args: impl IntoIterator<Item = String>) -> i32 {
    let args: Vec<String> = args.into_iter().collect();
    let watch_seconds = match args::parse(args.clone()) {
        Ok(ParsedArgs::Command(command)) => common_args(&command).watch_seconds,
        Ok(ParsedArgs::Help | ParsedArgs::Version) => None,
        Err(error) => {
            eprintln!("usagebar-cli: {error}");
            eprintln!("Run 'usagebar-cli --help' for usage.");
            return 2;
        }
    };
    let app_data_dir = match app_data_dir() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("usagebar-cli: {}", error.message());
            return error.exit_code();
        }
    };
    loop {
        match execute(
            args.clone(),
            &app_data_dir,
            env!("CARGO_PKG_VERSION"),
            OffsetDateTime::now_utc(),
        ) {
            Ok(output) => {
                println!("{output}");
                let _ = std::io::stdout().flush();
            }
            Err(error) => {
                eprintln!("usagebar-cli: {}", error.message());
                return error.exit_code();
            }
        }
        let Some(seconds) = watch_seconds else {
            return 0;
        };
        std::thread::sleep(Duration::from_secs(u64::from(seconds)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_http_api::cache::CachedPluginSnapshot;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("usagebar-cli-{name}-{}", uuid::Uuid::new_v4()))
    }

    fn write_cache(dir: &Path) {
        std::fs::create_dir_all(dir).unwrap();
        let snapshot = CachedPluginSnapshot {
            provider_id: "claude".to_string(),
            instance_ref: None,
            display_name: "Claude".to_string(),
            plan: Some("Pro".to_string()),
            lines: Vec::new(),
            history: None,
            fetched_at: "2026-07-12T08:00:00Z".to_string(),
            freshness: None,
        };
        let file = serde_json::json!({
            "version": 2,
            "snapshots": { "claude": snapshot }
        });
        std::fs::write(
            dir.join("usage-api-cache.json"),
            serde_json::to_vec(&file).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn usage_reads_enabled_cached_snapshot_without_runtime_state() {
        let dir = temp_dir("usage");
        write_cache(&dir);

        let output = execute(
            ["usage", "--provider", "claude", "--json"].map(str::to_string),
            &dir,
            "0.1.0-test",
            OffsetDateTime::UNIX_EPOCH,
        )
        .unwrap();
        let json: serde_json::Value = serde_json::from_str(&output).unwrap();
        assert_eq!(json["command"], "usage");
        assert_eq!(json["providers"][0]["providerId"], "claude");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn parser_and_cache_failures_have_distinct_exit_codes() {
        let dir = temp_dir("errors");
        let usage_error = execute(
            ["usage", "--days", "7"].map(str::to_string),
            &dir,
            "0.1.0-test",
            OffsetDateTime::UNIX_EPOCH,
        )
        .unwrap_err();
        assert_eq!(usage_error.exit_code(), 2);

        let cache_error = execute(
            ["usage"].map(str::to_string),
            &dir,
            "0.1.0-test",
            OffsetDateTime::UNIX_EPOCH,
        )
        .unwrap_err();
        assert_eq!(cache_error.exit_code(), 1);
    }
}
