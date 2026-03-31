# JetBrains AI Assistant

Tracks JetBrains AI Assistant quota from the local IDE quota cache.

## Windows Status

- Windows support is currently **supported** in this fork.
- Supported Windows config roots now include both `~/AppData/Roaming/JetBrains` and `~/AppData/Roaming/Google` for Android Studio installs.
- Directory matching is case-insensitive so IDE folder casing on Windows does not block discovery.
- Verified locally on this machine against real quota XML under `IntelliJIdea2025.2`, `PyCharm2025.2`, `Rider2025.3`, and `WebStorm2025.2`.

## Data Source

The plugin reads `AIAssistantQuotaManager2.xml` from JetBrains IDE config directories.

### Candidate base directories

- macOS: `~/Library/Application Support/JetBrains`
- macOS (Android Studio): `~/Library/Application Support/Google`
- Linux: `~/.config/JetBrains`
- Linux fallback: `~/.local/share/JetBrains`
- Linux (Android Studio): `~/.config/Google`
- Windows: `~/AppData/Roaming/JetBrains`
- Windows (Android Studio): `~/AppData/Roaming/Google`

For each base directory, the plugin lists real IDE directories on disk (WebStorm, IntelliJ IDEA, PyCharm, etc.), then picks the valid entry with the latest quota window.

## Parsed Fields

From `quotaInfo`:
- `current` -> used quota
- `maximum` -> quota limit
- `available` -> remaining quota
- `until` -> next reset timestamp

From `nextRefill`:
- `tariff.duration` -> period duration when present (for pacing in UI)
- `next` -> primary renewal/reset timestamp used in OpenUsage

From nested quota buckets:
- `tariffQuota.available` + `topUpQuota.available` are used as remaining when top-level `available` is missing.
- Large raw values are normalized to credits for display (JetBrains stores quota in finer-grained internal units).

## Displayed Lines

| Line      | Scope    | Description |
|-----------|----------|-------------|
| Quota     | Overview | Used percentage |
| Used      | Detail   | Used quota amount |
| Remaining | Detail   | Remaining quota |

## Errors

| Condition | Message |
|-----------|---------|
| No valid quota file found | "JetBrains AI Assistant not detected. Open a JetBrains IDE with AI Assistant enabled." |
| Quota file present but invalid | "JetBrains AI Assistant quota data unavailable. Open AI Assistant once and try again." |

## Windows Verification Focus

Minimum Windows checks for this provider:

1. Signed-in JetBrains IDE with AI Assistant enabled.
2. Standard JetBrains roaming path.
3. Android Studio under the Google roaming path if installed.
4. Missing-quota-file path after sign-in but before first AI Assistant usage.
5. A mixed-case IDE directory name to confirm discovery is not casing-sensitive.
