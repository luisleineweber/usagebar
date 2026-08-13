# UsageBar CLI

`usagebar-cli` is a read-only console companion for UsageBar. It reads the same persisted cache as the tray app and never starts the desktop runtime or probes providers.

## Install and run

The Windows installer includes `usagebar-cli.exe` and adds the UsageBar install directory to the current user's `PATH`. Open a new terminal after installing or uninstalling so it receives the updated environment.

## Build and run from source

From the repository:

```powershell
cargo build --release --manifest-path src-tauri/Cargo.toml --bin usagebar-cli
src-tauri\target\release\usagebar-cli.exe --help
```

## Commands

```powershell
usagebar-cli usage
usagebar-cli usage --provider claude
usagebar-cli usage --json

usagebar-cli history --days 7
usagebar-cli history --provider codex --json

usagebar-cli statusline
usagebar-cli statusline --provider opencode
usagebar-cli statusline --watch 5
```

- `usage` prints the latest cached metric lines for enabled providers.
- `history` prints cached history inside a 1 to 3650 day window; the default is 30 days.
- `statusline` emits exactly one sanitized line for editor and terminal status bars.
- `--json` emits a versioned JSON object.
- `--provider <id>` limits output to one enabled cached provider.
- `--watch <1-3600>` re-reads the cache at the selected interval. JSON mode emits one object per line.

History JSON totals use `number | null`. `null` means the selected history did not provide that metric; it is not zero.

## Cache and exit behavior

On Windows, the default cache is `%APPDATA%\com.sunstory.usagebar\usage-api-cache.json`. Set `USAGEBAR_APP_DATA_DIR` to read a different UsageBar data directory for development or support reproduction.

Exit codes:

- `0`: output, help, or version completed successfully.
- `1`: the cache, settings, provider, or history request could not be satisfied.
- `2`: invalid command-line usage.

The CLI never returns credentials, cookies, API keys, or raw provider payloads.
