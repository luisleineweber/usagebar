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
```

## Capture logs

### Option A: from the app folder (recommended)

1. Close UsageBar (to ensure logs flush to disk).
2. Open File Explorer and paste this into the address bar:

```text
%APPDATA%\com.sunstory.openusage
```

3. Open the `logs` folder.
4. Attach `openusage.log` and, if present, rotated logs like `openusage.log.1`.

### Option B: from the command line

PowerShell:

```powershell
$p = Join-Path $env:APPDATA "com.sunstory.openusage\logs"
Write-Host $p
Get-ChildItem $p | Sort-Object LastWriteTime -Descending | Select-Object -First 10
```

## Privacy note

Logs are redacted for common secrets, but still review before sharing in public.

