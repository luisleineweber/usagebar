# Proxy Configuration

UsageBar can route provider and plugin HTTP requests through an optional proxy.

- **Supported proxy types**: `socks5://`, `http://`, `https://`
- **Config file**: `~/.usagebar/config.json`
- **Default**: off
- **UI**: none

## Config File

Create `~/.usagebar/config.json`:

```json
{
  "proxy": {
    "enabled": true,
    "url": "socks5://127.0.0.1:10808"
  }
}
```

You can also use an authenticated proxy URL:

```json
{
  "proxy": {
    "enabled": true,
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

## Behavior

- Config is loaded once when the app starts.
- Restart UsageBar after changing the file.
- `localhost`, `127.0.0.1`, and `::1` always bypass the proxy.
- Missing, disabled, invalid, or unreadable config leaves proxying off.
- Proxy credentials are redacted in logs.

## Scope

This applies to provider and plugin HTTP requests that go through UsageBar's built-in HTTP client.

It is not a general system proxy setting and does not automatically proxy unrelated subprocess network traffic.

## Provider-Specific Proxy Settings

Some providers may need additional configuration. The proxy setting above is global and applies to all plugin HTTP requests.
