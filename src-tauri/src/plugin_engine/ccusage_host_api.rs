const CCUSAGE_VERSION: &str = "20.0.18";
const CCUSAGE_PACKAGE_NAME: &str = "ccusage";
const CCUSAGE_BIN_NAME: &str = "ccusage";
const CCUSAGE_LEGACY_VERSION: &str = "18.0.11";
const CCUSAGE_LEGACY_CLAUDE_PACKAGE_NAME: &str = "ccusage";
const CCUSAGE_LEGACY_CODEX_PACKAGE_NAME: &str = "@ccusage/codex";
const CCUSAGE_LEGACY_CODEX_BIN_NAME: &str = "ccusage-codex";
const CCUSAGE_TIMEOUT_SECS: u64 = 15;
const CCUSAGE_POLL_INTERVAL_MS: u64 = 100;

#[derive(Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CcusageQueryOpts {
    provider: Option<String>,
    since: Option<String>,
    until: Option<String>,
    home_path: Option<String>,
    claude_path: Option<String>,
    offline: Option<bool>,
    mode: Option<String>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageProvider {
    Claude,
    Codex,
    OpenCode,
    Amp,
    Droid,
    Codebuff,
    Hermes,
    Pi,
    Goose,
    OpenClaw,
    Kilo,
    Kimi,
    Qwen,
    Copilot,
    Gemini,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageRunnerKind {
    Bunx,
    PnpmDlx,
    YarnDlx,
    NpmExec,
    Npx,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageCommandFlavor {
    Current,
    Legacy,
}

fn ccusage_runner_order() -> [CcusageRunnerKind; 5] {
    [
        CcusageRunnerKind::Bunx,
        CcusageRunnerKind::PnpmDlx,
        CcusageRunnerKind::YarnDlx,
        CcusageRunnerKind::NpmExec,
        CcusageRunnerKind::Npx,
    ]
}

fn ccusage_runner_label(kind: CcusageRunnerKind) -> &'static str {
    match kind {
        CcusageRunnerKind::Bunx => "bun x",
        CcusageRunnerKind::PnpmDlx => "pnpm dlx",
        CcusageRunnerKind::YarnDlx => "yarn dlx",
        CcusageRunnerKind::NpmExec => "npm exec",
        CcusageRunnerKind::Npx => "npx",
    }
}

#[derive(Copy, Clone)]
struct CcusageProviderConfig {
    command_namespace: &'static str,
    home_env_var: Option<&'static str>,
}

fn parse_ccusage_provider(value: &str) -> Option<CcusageProvider> {
    match value.trim().to_ascii_lowercase().as_str() {
        "claude" => Some(CcusageProvider::Claude),
        "codex" => Some(CcusageProvider::Codex),
        "opencode" | "opencode-go" => Some(CcusageProvider::OpenCode),
        "amp" => Some(CcusageProvider::Amp),
        "droid" | "factory" => Some(CcusageProvider::Droid),
        "codebuff" => Some(CcusageProvider::Codebuff),
        "hermes" => Some(CcusageProvider::Hermes),
        "pi" => Some(CcusageProvider::Pi),
        "goose" => Some(CcusageProvider::Goose),
        "openclaw" => Some(CcusageProvider::OpenClaw),
        "kilo" => Some(CcusageProvider::Kilo),
        "kimi" => Some(CcusageProvider::Kimi),
        "qwen" => Some(CcusageProvider::Qwen),
        "copilot" => Some(CcusageProvider::Copilot),
        "gemini" => Some(CcusageProvider::Gemini),
        _ => None,
    }
}

fn infer_ccusage_provider(plugin_id: &str) -> Option<CcusageProvider> {
    parse_ccusage_provider(plugin_id)
}

fn resolve_ccusage_provider(opts: &CcusageQueryOpts, plugin_id: &str) -> CcusageProvider {
    opts.provider
        .as_deref()
        .and_then(parse_ccusage_provider)
        .or_else(|| infer_ccusage_provider(plugin_id))
        .unwrap_or(CcusageProvider::Claude)
}

fn ccusage_provider_config(provider: CcusageProvider) -> CcusageProviderConfig {
    match provider {
        CcusageProvider::Claude => CcusageProviderConfig {
            command_namespace: "claude",
            home_env_var: Some("CLAUDE_CONFIG_DIR"),
        },
        CcusageProvider::Codex => CcusageProviderConfig {
            command_namespace: "codex",
            home_env_var: Some("CODEX_HOME"),
        },
        CcusageProvider::OpenCode => CcusageProviderConfig {
            command_namespace: "opencode",
            home_env_var: Some("OPENCODE_DATA_DIR"),
        },
        CcusageProvider::Amp => CcusageProviderConfig {
            command_namespace: "amp",
            home_env_var: Some("AMP_DATA_DIR"),
        },
        CcusageProvider::Droid => CcusageProviderConfig {
            command_namespace: "droid",
            home_env_var: Some("DROID_SESSIONS_DIR"),
        },
        CcusageProvider::Codebuff => CcusageProviderConfig {
            command_namespace: "codebuff",
            home_env_var: Some("CODEBUFF_DATA_DIR"),
        },
        CcusageProvider::Hermes => CcusageProviderConfig {
            command_namespace: "hermes",
            home_env_var: Some("HERMES_HOME"),
        },
        CcusageProvider::Pi => CcusageProviderConfig {
            command_namespace: "pi",
            home_env_var: Some("PI_AGENT_DIR"),
        },
        CcusageProvider::Goose => CcusageProviderConfig {
            command_namespace: "goose",
            home_env_var: Some("GOOSE_PATH_ROOT"),
        },
        CcusageProvider::OpenClaw => CcusageProviderConfig {
            command_namespace: "openclaw",
            home_env_var: Some("OPENCLAW_DIR"),
        },
        CcusageProvider::Kilo => CcusageProviderConfig {
            command_namespace: "kilo",
            home_env_var: Some("KILO_DATA_DIR"),
        },
        CcusageProvider::Kimi => CcusageProviderConfig {
            command_namespace: "kimi",
            home_env_var: Some("KIMI_DATA_DIR"),
        },
        CcusageProvider::Qwen => CcusageProviderConfig {
            command_namespace: "qwen",
            home_env_var: Some("QWEN_DATA_DIR"),
        },
        CcusageProvider::Copilot => CcusageProviderConfig {
            command_namespace: "copilot",
            home_env_var: Some("COPILOT_OTEL_FILE_EXPORTER_PATH"),
        },
        CcusageProvider::Gemini => CcusageProviderConfig {
            command_namespace: "gemini",
            home_env_var: Some("GEMINI_DATA_DIR"),
        },
    }
}

fn ccusage_legacy_supported(provider: CcusageProvider) -> bool {
    matches!(provider, CcusageProvider::Claude | CcusageProvider::Codex)
}

fn ccusage_package_spec() -> String {
    format!("{}@{}", CCUSAGE_PACKAGE_NAME, CCUSAGE_VERSION)
}

fn ccusage_legacy_package_spec(provider: CcusageProvider) -> String {
    let package_name = match provider {
        CcusageProvider::Claude => CCUSAGE_LEGACY_CLAUDE_PACKAGE_NAME,
        CcusageProvider::Codex => CCUSAGE_LEGACY_CODEX_PACKAGE_NAME,
        _ => CCUSAGE_PACKAGE_NAME,
    };
    format!("{}@{}", package_name, CCUSAGE_LEGACY_VERSION)
}

fn ccusage_home_override(opts: &CcusageQueryOpts, provider: CcusageProvider) -> Option<&str> {
    if let Some(home_path) = opts
        .home_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(home_path);
    }

    match provider {
        CcusageProvider::Claude => opts
            .claude_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty()),
        _ => None,
    }
}

fn ccusage_runner_candidates(kind: CcusageRunnerKind) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    match kind {
        CcusageRunnerKind::Bunx => {
            #[cfg(target_os = "windows")]
            {
                if let Some(home) = dirs::home_dir() {
                    candidates.push(home.join(".bun/bin/bun.exe").to_string_lossy().to_string());
                }
                candidates.push("bun".to_string());
            }

            #[cfg(not(target_os = "windows"))]
            {
                if let Some(home) = dirs::home_dir() {
                    candidates.push(home.join(".bun/bin/bunx").to_string_lossy().to_string());
                }
                candidates.extend(
                    ["/opt/homebrew/bin/bunx", "/usr/local/bin/bunx", "bunx"]
                        .into_iter()
                        .map(str::to_string),
                );
            }
        }
        CcusageRunnerKind::PnpmDlx => {
            candidates.extend(
                ["/opt/homebrew/bin/pnpm", "/usr/local/bin/pnpm", "pnpm"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::YarnDlx => {
            candidates.extend(
                ["/opt/homebrew/bin/yarn", "/usr/local/bin/yarn", "yarn"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::NpmExec => {
            candidates.extend(
                ["/opt/homebrew/bin/npm", "/usr/local/bin/npm", "npm"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
        CcusageRunnerKind::Npx => {
            candidates.extend(
                ["/opt/homebrew/bin/npx", "/usr/local/bin/npx", "npx"]
                    .into_iter()
                    .map(str::to_string),
            );
        }
    }

    let mut unique = Vec::new();
    for candidate in candidates {
        if candidate.is_empty() || unique.iter().any(|c| c == &candidate) {
            continue;
        }
        unique.push(candidate);
    }
    unique
}

fn nvm_default_bin_path(home: &Path) -> Option<PathBuf> {
    let alias_path = home.join(".nvm/alias/default");
    let version = std::fs::read_to_string(&alias_path).ok()?;
    let version = version.trim();
    if version.is_empty() {
        return None;
    }
    let version = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };
    Some(home.join(".nvm/versions/node").join(version).join("bin"))
}

fn ccusage_path_entries_with(home: Option<&Path>, existing_path: Option<&OsStr>) -> Vec<PathBuf> {
    let mut entries: Vec<PathBuf> = Vec::new();

    if let Some(home) = home {
        entries.push(home.join(".bun/bin"));
        entries.push(home.join(".nvm/current/bin"));
        if let Some(nvm_bin) = nvm_default_bin_path(home) {
            entries.push(nvm_bin);
        }
        entries.push(home.join(".local/bin"));
    }

    entries.extend(
        ["/opt/homebrew/bin", "/usr/local/bin"]
            .into_iter()
            .map(PathBuf::from),
    );

    if let Some(existing_path) = existing_path {
        for path in std::env::split_paths(existing_path) {
            entries.push(path);
        }
    }

    let mut unique_entries = Vec::new();
    for entry in entries {
        if entry.as_os_str().is_empty() || unique_entries.iter().any(|path| path == &entry) {
            continue;
        }
        unique_entries.push(entry);
    }
    unique_entries
}

fn ccusage_enriched_path_with(
    home: Option<&Path>,
    existing_path: Option<&OsStr>,
) -> Option<OsString> {
    let entries = ccusage_path_entries_with(home, existing_path);
    if entries.is_empty() {
        return None;
    }
    std::env::join_paths(entries).ok()
}

fn ccusage_enriched_path() -> Option<OsString> {
    let home = dirs::home_dir();
    let existing_path = std::env::var_os("PATH");
    ccusage_enriched_path_with(home.as_deref(), existing_path.as_deref())
}

fn ccusage_runner_available(candidate: &str, enriched_path: Option<&OsStr>) -> bool {
    let mut command = std::process::Command::new(candidate);
    configure_background_command(&mut command);
    command.arg("--version");
    if let Some(path) = enriched_path {
        command.env("PATH", path);
    }
    command
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    command.status().map(|s| s.success()).unwrap_or(false)
}

fn configure_ccusage_command(
    command: &mut std::process::Command,
    args: &[String],
    enriched_path: Option<&OsStr>,
) {
    configure_background_command(command);
    command.args(args);
    if let Some(path) = enriched_path {
        command.env("PATH", path);
    }
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
}

fn resolve_ccusage_runner_binary(kind: CcusageRunnerKind) -> Option<String> {
    let path = ccusage_enriched_path();
    ccusage_runner_candidates(kind)
        .into_iter()
        .find(|candidate| ccusage_runner_available(candidate, path.as_deref()))
}

type CcusageRunnerList = Vec<(CcusageRunnerKind, String)>;
type CcusageRunnerCache = Mutex<Option<CcusageRunnerList>>;

fn collect_ccusage_runners_with<F>(mut resolver: F) -> Vec<(CcusageRunnerKind, String)>
where
    F: FnMut(CcusageRunnerKind) -> Option<String>,
{
    let mut runners = Vec::new();
    for kind in ccusage_runner_order() {
        if let Some(program) = resolver(kind) {
            runners.push((kind, program));
        }
    }
    runners
}

fn collect_ccusage_runners() -> Vec<(CcusageRunnerKind, String)> {
    collect_ccusage_runners_with(resolve_ccusage_runner_binary)
}

fn ccusage_runner_cache() -> &'static CcusageRunnerCache {
    static CACHE: OnceLock<CcusageRunnerCache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn read_ccusage_runner_cache() -> Option<Vec<(CcusageRunnerKind, String)>> {
    ccusage_runner_cache().lock().ok()?.clone()
}

fn write_ccusage_runner_cache(runners: &[(CcusageRunnerKind, String)]) {
    if runners.is_empty() {
        return;
    }

    if let Ok(mut cache) = ccusage_runner_cache().lock() {
        *cache = Some(runners.to_vec());
    }
}

fn invalidate_ccusage_runner_cache() {
    if let Ok(mut cache) = ccusage_runner_cache().lock() {
        *cache = None;
    }
}

fn collect_ccusage_runners_cached_with<F>(mut resolver: F) -> Vec<(CcusageRunnerKind, String)>
where
    F: FnMut() -> Vec<(CcusageRunnerKind, String)>,
{
    if let Some(runners) = read_ccusage_runner_cache() {
        return runners;
    }

    let runners = resolver();
    write_ccusage_runner_cache(&runners);
    runners
}

fn collect_ccusage_runners_cached() -> Vec<(CcusageRunnerKind, String)> {
    collect_ccusage_runners_cached_with(collect_ccusage_runners)
}

fn append_ccusage_common_args(
    args: &mut Vec<String>,
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    flavor: CcusageCommandFlavor,
) {
    let config = ccusage_provider_config(provider);
    if flavor == CcusageCommandFlavor::Current {
        args.push(config.command_namespace.to_string());
    }

    args.extend([
        "daily".to_string(),
        "--json".to_string(),
        "--order".to_string(),
        "desc".to_string(),
    ]);

    if let Some(since) = opts
        .since
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--since".to_string());
        args.push(since.to_string());
    }

    if let Some(until) = opts
        .until
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--until".to_string());
        args.push(until.to_string());
    }

    if flavor == CcusageCommandFlavor::Current {
        if opts.offline == Some(true) {
            args.push("--offline".to_string());
        }
        if let Some(mode) = opts
            .mode
            .as_deref()
            .map(str::trim)
            .filter(|mode| matches!(*mode, "auto" | "calculate" | "display"))
        {
            args.push("--mode".to_string());
            args.push(mode.to_string());
        }
    }
}

fn ccusage_runner_args(
    kind: CcusageRunnerKind,
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    flavor: CcusageCommandFlavor,
) -> Vec<String> {
    let package_spec = match flavor {
        CcusageCommandFlavor::Current => ccusage_package_spec(),
        CcusageCommandFlavor::Legacy => ccusage_legacy_package_spec(provider),
    };
    let npm_exec_bin = match (flavor, provider) {
        (CcusageCommandFlavor::Current, _) => CCUSAGE_BIN_NAME,
        (CcusageCommandFlavor::Legacy, CcusageProvider::Claude) => CCUSAGE_BIN_NAME,
        (CcusageCommandFlavor::Legacy, CcusageProvider::Codex) => CCUSAGE_LEGACY_CODEX_BIN_NAME,
        (CcusageCommandFlavor::Legacy, _) => CCUSAGE_BIN_NAME,
    };
    let mut args: Vec<String> = match kind {
        CcusageRunnerKind::Bunx => {
            #[cfg(target_os = "windows")]
            {
                vec![
                    "x".to_string(),
                    "--silent".to_string(),
                    package_spec.clone(),
                ]
            }

            #[cfg(not(target_os = "windows"))]
            {
                vec!["--silent".to_string(), package_spec.clone()]
            }
        }
        CcusageRunnerKind::PnpmDlx => {
            vec!["-s".to_string(), "dlx".to_string(), package_spec.clone()]
        }
        CcusageRunnerKind::YarnDlx => {
            vec!["dlx".to_string(), "-q".to_string(), package_spec.clone()]
        }
        CcusageRunnerKind::NpmExec => vec![
            "exec".to_string(),
            "--yes".to_string(),
            format!("--package={package_spec}"),
            "--".to_string(),
            npm_exec_bin.to_string(),
        ],
        CcusageRunnerKind::Npx => vec!["--yes".to_string(), package_spec],
    };

    append_ccusage_common_args(&mut args, opts, provider, flavor);
    args
}

fn extract_last_json_value(stdout: &str) -> Option<String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return None;
    }

    if serde_json::from_str::<serde_json::Value>(trimmed).is_ok() {
        return Some(trimmed.to_string());
    }

    let mut starts: Vec<usize> = trimmed
        .char_indices()
        .filter(|(_, c)| *c == '{' || *c == '[')
        .map(|(idx, _)| idx)
        .collect();
    starts.reverse();

    for start in starts {
        let candidate = trimmed[start..].trim();
        if serde_json::from_str::<serde_json::Value>(candidate).is_ok() {
            return Some(candidate.to_string());
        }
    }

    None
}

fn normalize_ccusage_output(stdout: &str) -> Option<String> {
    let json_value = extract_last_json_value(stdout)?;
    let parsed: serde_json::Value = serde_json::from_str(&json_value).ok()?;

    let normalized = match parsed {
        serde_json::Value::Array(daily) => serde_json::json!({ "daily": daily }),
        serde_json::Value::Object(map) => {
            let daily = map.get("daily")?;
            if !daily.is_array() {
                return None;
            }
            serde_json::Value::Object(map)
        }
        _ => return None,
    };

    serde_json::to_string(&normalized).ok()
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
enum CcusageRunStatus {
    Success,
    Failed,
    SpawnFailed,
}

fn run_ccusage_with_runner_flavor(
    kind: CcusageRunnerKind,
    program: &str,
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
    flavor: CcusageCommandFlavor,
) -> (CcusageRunStatus, Option<String>) {
    let args = ccusage_runner_args(kind, opts, provider, flavor);
    let enriched_path = ccusage_enriched_path();
    let mut command = std::process::Command::new(program);
    configure_ccusage_command(&mut command, &args, enriched_path.as_deref());

    if let Some(home_path) = ccusage_home_override(opts, provider) {
        let config = ccusage_provider_config(provider);
        if let Some(home_env_var) = config.home_env_var {
            command.env(home_env_var, home_path);
        }
    }

    log::info!(
        "[plugin:{}] ccusage query via {} {:?} ({})",
        plugin_id,
        ccusage_runner_label(kind),
        flavor,
        program
    );

    let mut child = match command.spawn() {
        Ok(c) => c,
        Err(e) => {
            log::warn!(
                "[plugin:{}] ccusage spawn failed for {}: {}",
                plugin_id,
                ccusage_runner_label(kind),
                e
            );
            return (CcusageRunStatus::SpawnFailed, None);
        }
    };

    // Drain pipes concurrently while the process is running so the child cannot block on full
    // stdout/stderr buffers before exit.
    let mut stdout_reader = child.stdout.take().map(|mut stdout| {
        std::thread::spawn(move || {
            let mut v = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stdout, &mut v);
            v
        })
    });
    let mut stderr_reader = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut v = Vec::new();
            let _ = std::io::Read::read_to_end(&mut stderr, &mut v);
            v
        })
    });

    let timeout = std::time::Duration::from_secs(CCUSAGE_TIMEOUT_SECS);
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = stdout_reader
                    .take()
                    .and_then(|reader| reader.join().ok())
                    .unwrap_or_default();
                let stderr = stderr_reader
                    .take()
                    .and_then(|reader| reader.join().ok())
                    .unwrap_or_default();

                if status.success() {
                    let out = String::from_utf8_lossy(&stdout);
                    if let Some(normalized_json) = normalize_ccusage_output(&out) {
                        return (CcusageRunStatus::Success, Some(normalized_json));
                    }
                    log::warn!(
                        "[plugin:{}] ccusage output parse failed for {}",
                        plugin_id,
                        ccusage_runner_label(kind)
                    );
                    return (CcusageRunStatus::Failed, None);
                }

                let err = String::from_utf8_lossy(&stderr);
                log::warn!(
                    "[plugin:{}] ccusage failed for {}: {}",
                    plugin_id,
                    ccusage_runner_label(kind),
                    err.trim()
                );
                return (CcusageRunStatus::Failed, None);
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.take().and_then(|reader| reader.join().ok());
                    let _ = stderr_reader.take().and_then(|reader| reader.join().ok());
                    log::warn!(
                        "[plugin:{}] ccusage timed out after {}s for {}",
                        plugin_id,
                        CCUSAGE_TIMEOUT_SECS,
                        ccusage_runner_label(kind)
                    );
                    return (CcusageRunStatus::Failed, None);
                }
                std::thread::sleep(std::time::Duration::from_millis(CCUSAGE_POLL_INTERVAL_MS));
            }
            Err(e) => {
                log::warn!(
                    "[plugin:{}] ccusage wait failed for {}: {}",
                    plugin_id,
                    ccusage_runner_label(kind),
                    e
                );
                return (CcusageRunStatus::Failed, None);
            }
        }
    }
}

fn run_ccusage_with_runner_list(
    runners: &[(CcusageRunnerKind, String)],
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
) -> (bool, Option<String>) {
    let mut every_runner_failed_to_spawn = true;
    let flavors = if ccusage_legacy_supported(provider) {
        vec![CcusageCommandFlavor::Current, CcusageCommandFlavor::Legacy]
    } else {
        vec![CcusageCommandFlavor::Current]
    };
    for flavor in flavors {
        for (kind, program) in runners {
            let (status, result) =
                run_ccusage_with_runner_flavor(*kind, program, opts, provider, plugin_id, flavor);
            if let Some(result) = result {
                return (false, Some(result));
            }
            if status != CcusageRunStatus::SpawnFailed {
                every_runner_failed_to_spawn = false;
            }
        }
    }

    (every_runner_failed_to_spawn, None)
}

fn run_ccusage_query_with<FCached, FInvalidate, FRun>(
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
    mut collect_runners: FCached,
    mut invalidate_cache: FInvalidate,
    mut run_runners: FRun,
) -> Result<String, &'static str>
where
    FCached: FnMut() -> Vec<(CcusageRunnerKind, String)>,
    FInvalidate: FnMut(),
    FRun: FnMut(
        &[(CcusageRunnerKind, String)],
        &CcusageQueryOpts,
        CcusageProvider,
        &str,
    ) -> (bool, Option<String>),
{
    let cached_runners = collect_runners();
    if cached_runners.is_empty() {
        log::warn!(
            "[plugin:{}] no package runner found for ccusage query",
            plugin_id
        );
        return Err("no_runner");
    }

    let (cache_stale, result) = run_runners(&cached_runners, opts, provider, plugin_id);
    if let Some(result) = result {
        return Ok(result);
    }

    if cache_stale {
        invalidate_cache();
        let refreshed_runners = collect_runners();
        if refreshed_runners.is_empty() {
            log::warn!(
                "[plugin:{}] no package runner found for ccusage query after cache refresh",
                plugin_id
            );
            return Err("no_runner");
        }

        let (_, refreshed_result) = run_runners(&refreshed_runners, opts, provider, plugin_id);
        if let Some(result) = refreshed_result {
            return Ok(result);
        }
    }

    Err("runner_failed")
}

fn run_ccusage_query(
    opts: &CcusageQueryOpts,
    provider: CcusageProvider,
    plugin_id: &str,
) -> Result<String, &'static str> {
    run_ccusage_query_with(
        opts,
        provider,
        plugin_id,
        collect_ccusage_runners_cached,
        invalidate_ccusage_runner_cache,
        run_ccusage_with_runner_list,
    )
}

fn inject_ccusage<'js>(
    ctx: &Ctx<'js>,
    host: &Object<'js>,
    plugin_id: &str,
) -> rquickjs::Result<()> {
    let ccusage_obj = Object::new(ctx.clone())?;
    let pid = plugin_id.to_string();

    ccusage_obj.set(
        "_queryRaw",
        Function::new(
            ctx.clone(),
            move |_ctx_inner: Ctx<'_>, opts_json: String| -> rquickjs::Result<String> {
                let opts: CcusageQueryOpts = match serde_json::from_str(&opts_json) {
                    Ok(v) => v,
                    Err(e) => {
                        log::warn!("[plugin:{}] invalid ccusage opts JSON: {}", pid, e);
                        CcusageQueryOpts::default()
                    }
                };
                let provider = resolve_ccusage_provider(&opts, &pid);
                match run_ccusage_query(&opts, provider, &pid) {
                    Ok(result) => {
                        let data: serde_json::Value = match serde_json::from_str(&result) {
                            Ok(v) => v,
                            Err(e) => {
                                log::warn!(
                                    "[plugin:{}] ccusage normalized payload parse failed: {}",
                                    pid,
                                    e
                                );
                                return Ok(
                                    serde_json::json!({ "status": "runner_failed" }).to_string()
                                );
                            }
                        };
                        Ok(serde_json::json!({ "status": "ok", "data": data }).to_string())
                    }
                    Err(status) => {
                        if status == "runner_failed" {
                            log::warn!(
                                "[plugin:{}] ccusage query failed with all available runners",
                                pid
                            );
                        }
                        Ok(serde_json::json!({ "status": status }).to_string())
                    }
                }
            },
        )?,
    )?;

    host.set("ccusage", ccusage_obj)?;
    Ok(())
}

pub fn patch_ccusage_wrapper(ctx: &rquickjs::Ctx<'_>) -> rquickjs::Result<()> {
    ctx.eval::<(), _>(
        r#"
        (function() {
            if (!__openusage_ctx.host.ccusage || !__openusage_ctx.host.ccusage._queryRaw) return;
            var rawFn = __openusage_ctx.host.ccusage._queryRaw;
            __openusage_ctx.host.ccusage.query = function(opts) {
                var result = rawFn(JSON.stringify(opts || {}));
                try {
                    var parsed = JSON.parse(result);
                    if (parsed && typeof parsed === "object" && typeof parsed.status === "string") {
                        return parsed;
                    }
                } catch (e) {}
                return { status: "runner_failed" };
            };
        })();
        "#
        .as_bytes(),
    )
}
