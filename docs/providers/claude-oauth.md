# Claude OAuth Configuration

## Default Behavior

By default, UsageBar uses the official Claude Code OAuth credentials (client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`). This works for most users without any additional configuration.

## Custom OAuth Configuration

If you need to use your own OAuth credentials (for enterprise compliance, custom deployments, or legal requirements), you can configure UsageBar to use custom OAuth settings.

## Configuration File

Create or edit `~/.usagebar/config.json`:

```json
{
  "claude": {
    "oauth": {
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "scopes": "user:profile user:inference user:sessions:claude_code user:mcp_servers",
      "refreshUrl": "https://platform.claude.com/v1/oauth/token"
    }
  }
}
```

## Configuration Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `clientId` | Yes | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` | OAuth client ID |
| `clientSecret` | No | `null` | OAuth client secret (if required) |
| `scopes` | No | `user:profile user:inference user:sessions:claude_code user:mcp_servers` | OAuth scopes |
| `refreshUrl` | No | `https://platform.claude.com/v1/oauth/token` | Token refresh endpoint |

## Minimal Configuration

The minimal custom configuration only requires `clientId`:

```json
{
  "claude": {
    "oauth": {
      "clientId": "your-client-id"
    }
  }
}
```

All other values will use the defaults.

## Security Notes

- The config file is stored in your home directory and should have restricted permissions (e.g., `chmod 600 ~/.usagebar/config.json`)
- Client secrets (if used) are stored in plain text - consider using the default anonymous credentials if possible
- UsageBar logs will redact sensitive OAuth values

## Verification

After updating the config, restart UsageBar. You can verify the custom config is being used by checking the logs for:

```
[plugin:claude] using custom OAuth config from ~/.usagebar/config.json
```

## Enterprise Considerations

If your organization requires custom OAuth for compliance reasons:

1. Create a custom OAuth application in your identity provider
2. Configure the redirect URI to match Claude Code's expected format
3. Update `~/.usagebar/config.json` with your credentials
4. Authenticate with `claude` CLI as normal - it will use your custom OAuth endpoints

## Troubleshooting

If authentication fails with custom OAuth:

1. Verify `clientId` is correctly set in `~/.usagebar/config.json`
2. Check that the refresh URL is accessible from your network
3. Ensure scopes match what your identity provider expects
4. Review UsageBar logs for OAuth-related errors
