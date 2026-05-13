# Alibaba Coding Plan

Track Alibaba Coding Plan request quota usage.

## Authentication

Alibaba Coding Plan supports API key authentication:

1. Generate a Coding Plan API key from the Alibaba Cloud Coding Plan page. Coding Plan keys use the `sk-sp-...` format.
2. Add it to UsageBar Settings, or
3. Set the `ALIBABA_API_KEY` environment variable

## Configuration

### Region Selection

The plugin automatically detects your region and uses the appropriate API endpoint:

- Regions starting with `cn-` (e.g., `cn-beijing`, `cn-shanghai`) use the China endpoint
- All other regions use the global endpoint

You can override the region via the `ALIBABA_REGION` environment variable before launching UsageBar.

Default region: `cn-beijing`

## Tracked Metrics

- **5-hour**: Sliding-window request usage
- **Weekly**: Weekly request usage
- **Monthly**: Monthly request usage
- **Plan**: Reported Coding Plan tier
- **Region**: Shows which Alibaba region is being used

Current public Coding Plan docs describe Pro as 6,000 requests per 5 hours, 45,000 requests per week, and 90,000 requests per month. Older Lite subscriptions are no longer sold to new users but remain supported as 1,200 / 9,000 / 18,000 request limits when the API identifies the plan as Lite.

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

- [Alibaba Cloud Coding Plan overview](https://www.alibabacloud.com/help/en/model-studio/coding-plan)
