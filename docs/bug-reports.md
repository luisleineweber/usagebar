# Bug reports (Windows)

What to include when something breaks, and how to grab logs on Windows.

## What to include

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which provider was affected (Codex / Claude / Cursor / etc.):
Provider setup source used (CLI login / API key / cookie header / local IDE files / env var):
UsageBar version:
Windows version:
Error text shown in UsageBar:
Last successful refresh time, if shown:
```

## Capture logs

### Option A: from the app folder (recommended)

1. Close UsageBar (to ensure logs flush to disk).
2. Open File Explorer and paste this into the address bar:

```text
%APPDATA%\com.sunstory.usagebar
```

3. Open the `logs` folder.
4. Attach `openusage.log` and, if present, rotated logs like `openusage.log.1`.

### Option B: from the command line

PowerShell:

```powershell
$p = Join-Path $env:APPDATA "com.sunstory.usagebar\logs"
Write-Host $p
Get-ChildItem $p | Sort-Object LastWriteTime -Descending | Select-Object -First 10
```

Legacy beta builds may have logs under `%APPDATA%\com.sunstory.openusage\logs`.

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.

Do not include:

- API keys, bearer tokens, OAuth tokens, or session cookies.
- Raw provider credential files from CLI, IDE, browser, or cloud SDK directories.
- `%APPDATA%\com.sunstory.usagebar\provider-secrets.json`.
- Screenshots that show full secrets, cookies, account tokens, or private workspace names.

Good diagnostics:

- Exact error text shown in UsageBar.
- Local timestamp and timezone.
- Provider name and setup source.
- Sanitized `openusage.log` lines around the failure.

