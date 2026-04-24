# Kiro

Track your Kiro AI coding assistant usage.

## Authentication

Kiro uses authentication data stored by the Kiro desktop application:

- **macOS**: Reads from `~/.aws/sso/cache/kiro-auth-token.json` and Kiro's state database
- **Windows**: Reads from `%USERPROFILE%/.aws/sso/cache/kiro-auth-token.json` and `%APPDATA%/Kiro/User/globalStorage/state.vscdb`
- **Linux**: Reads from `~/.aws/sso/cache/kiro-auth-token.json` and `~/.config/Kiro/User/globalStorage/state.vscdb`

## How It Works

Kiro usage is fetched from multiple sources:

1. **Live API** - Queries AWS to get the latest usage limits and current usage
2. **Local Cache** - Reads from Kiro's local state database for quick access
3. **Log Files** - Parses Kiro's log files as a fallback when other sources are unavailable

## Tracked Metrics

- **Credits**: Current usage against your credit limit
- **Bonus Credits**: Any bonus credits or free trial usage
- **Overages**: Whether overages are enabled for your account

## Troubleshooting

### "Open Kiro and sign in, then try again."

- Ensure Kiro is installed and you have signed in at least once
- The plugin needs the authentication token file to exist

### "Kiro session expired."

- Open Kiro and sign in again to refresh the session
- This may happen if you haven't opened Kiro for a while

### "Kiro usage data unavailable."

- Open the Kiro account dashboard once to initialize usage data
- Ensure you have an active Kiro subscription

## Platform Notes

- **Windows**: Uses `%APPDATA%` paths for state and logs
- **macOS**: Uses `~/Library/Application Support/Kiro` paths
- **Linux**: Uses `~/.config/Kiro` paths
