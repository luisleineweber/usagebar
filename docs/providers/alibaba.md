# Alibaba Coding Plan

Track your Alibaba Coding Plan usage.

## Authentication

Alibaba Coding Plan supports API key authentication:

1. Generate an API key from the [Alibaba Cloud Console](https://www.alibabacloud.com/)
2. Add it to UsageBar Settings, or
3. Set the `ALIBABA_API_KEY` environment variable

## Configuration

### Region Selection

The plugin automatically detects your region and uses the appropriate API endpoint:

- Regions starting with `cn-` (e.g., `cn-beijing`, `cn-shanghai`) use the China endpoint
- All other regions use the global endpoint

You can override the region in UsageBar Settings or via the `ALIBABA_REGION` environment variable.

Default region: `cn-beijing`

## Tracked Metrics

- **Daily Quota**: Current day's usage with automatic reset
- **Weekly Quota**: Weekly usage with automatic reset
- **Region Badge**: Shows which Alibaba region is being used

## Troubleshooting

### "Alibaba API key missing"

- Ensure your API key is saved in UsageBar Settings
- Check that `ALIBABA_API_KEY` environment variable is set if using env auth

### "Alibaba API key invalid"

- Verify your API key is still active in the Alibaba Cloud Console
- Check that the key has permissions for the Coding Plan service

### "Alibaba request failed"

- Check your network connection
- If behind a proxy, configure [Proxy Settings](../proxy.md)
- Verify the region setting is correct for your account

## API Documentation

- [Alibaba Cloud DevOps API](https://www.alibabacloud.com/product/devops)
