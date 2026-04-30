# Bug reports (Windows)

What to include when something breaks, and how to grab logs on Windows.

## What to include

Copy/paste and fill:

```text
What I expected:
What happened instead:
When it happened (local time + timezone):
Which provider was affected (Codex / Claude / Cursor / etc.):
UsageBar version:
Windows version:
Error text shown in UsageBar:
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

Logs are redacted for common secrets, but still review before sharing in public. Do not include API keys, cookies, raw credential files, or `provider-secrets.json`.

