# Archive: AI provider research dump

This is preserved from an early scratch note (`docs/Ausfuiehrung1.md`) and intentionally left unedited.

---

I'll research how major AI providers expose usage data via their APIs, and also look into what "Codexbar" does so I can give you the full picture for building a Windows equivalent.Hey Luis! Here's a comprehensive research on how the main AI providers send usage data back to the client, which is exactly what you need for building a Windows usage tracking tool (like a "Codexbar" equivalent). I'll also clarify what "Codexbar" likely refers to and address your Windows-specific issues.

---

## Clarification: "Codexbar" vs OpenAI Codex

Based on the search results, it seems you may be referring to a **menubar-style usage tracker** for AI API consumption — possibly inspired by tools that sit in the macOS menubar showing real-time token/cost stats. OpenAI's **Codex** is something different (an agentic coding tool, now available on Windows as of March 4, 2026). If you're building a **Windows system tray / taskbar tool** that monitors your AI API usage across providers, here's everything you need to know.

---

## 1. OpenAI — How Usage Data Is Sent

### A) Chat Completions API (`/v1/chat/completions`)

Every response includes a `usage` object in the JSON body:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "gpt-4o",
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 128,
    "total_tokens": 170
  }
}
```

For **reasoning models** (o3, o4-mini), there's also:
- `reasoning_tokens` — tokens used internally for chain-of-thought
- `prompt_tokens_details.cached_tokens` — tokens served from cache

### B) Responses API (newer)

The Responses API returns a similar `usage` field at the top level of the response object.

### C) HTTP Response Headers (Rate Limits)

OpenAI also sends rate-limit info via HTTP headers on every response:

| Header | Description |
|---|---|
| `x-ratelimit-limit-requests` | Max requests per minute |
| `x-ratelimit-limit-tokens` | Max tokens per minute |
| `x-ratelimit-remaining-requests` | Requests left in window |
| `x-ratelimit-remaining-tokens` | Tokens left in window |
| `x-ratelimit-reset-requests` | When request limit resets |
| `x-ratelimit-reset-tokens` | When token limit resets |

### D) Streaming (`stream: true`)

When streaming, the `usage` object is **only sent in the final chunk** (the one with `finish_reason`). You must capture the last SSE event to get token counts.

### E) Usage Dashboard API

OpenAI also has a **Usage API** at the organization level (`/v1/organization/usage`) for aggregated billing data, queryable by API key.

---

## 2. Anthropic (Claude) — How Usage Data Is Sent

### A) Messages API (`/v1/messages`)

Every response includes a `usage` object:

```json
{
  "id": "msg_abc123",
  "type": "message",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 25,
    "output_tokens": 150,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

Key fields:
- `input_tokens` — tokens in the prompt
- `output_tokens` — tokens in the response
- `cache_creation_input_tokens` — tokens written to prompt cache
- `cache_read_input_tokens` — tokens read from prompt cache (these are cheaper and don't count against ITPM limits on Claude 3.7 Sonnet+)

### B) Token Counting API (Standalone)

Anthropic offers a dedicated **Token Counting API** (`/v1/messages/count_tokens`) that lets you count tokens *before* sending a request. This is useful for pre-estimation:

```python
count = client.messages.count_tokens(
    model="claude-sonnet-4-20250514",
    messages=[{"role": "user", "content": "Hello!"}]
)
# count.input_tokens → 12
```

### C) HTTP Rate Limit Headers

Anthropic also returns rate-limit headers:

| Header | Description |
|---|---|
| `anthropic-ratelimit-requests-limit` | Max requests per minute |
| `anthropic-ratelimit-requests-remaining` | Requests remaining |
| `anthropic-ratelimit-requests-reset` | Reset timestamp |
| `anthropic-ratelimit-tokens-limit` | Max tokens per minute |
| `anthropic-ratelimit-tokens-remaining` | Tokens remaining |
| `anthropic-ratelimit-tokens-reset` | Reset timestamp |
| `retry-after` | Seconds to wait (on 429) |

### D) Streaming (`stream: true`)

During streaming, Anthropic sends a `message_start` event with initial usage, then a `message_delta` event at the end with `output_tokens`. You need to combine both:

```text
event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":25,"output_tokens":0}}}

...chunks...

event: message_delta  
data: {"type":"message_delta","usage":{"output_tokens":150}}
```

---

## 3. Google (Gemini) — How Usage Data Is Sent

### A) Gemini API (`generateContent`)

The response includes a `usageMetadata` object:

```json
{
  "candidates": [...],
  "usageMetadata": {
    "promptTokenCount": 42,
    "candidatesTokenCount": 128,
    "totalTokenCount": 170,
    "thoughtsTokenCount": 512
  }
}
```

For Gemini 3 and thinking models, `thoughtsTokenCount` tracks internal reasoning tokens.

### B) Media Resolution Control

Gemini 3 introduced `media_resolution` parameters (`low`, `medium`, `high`) to control how many tokens images/video consume — this affects token counts.

### C) Streaming

In streaming mode, `usageMetadata` is returned on the **last chunk** of the response.

### D) No Standalone Token Counter

Unlike Anthropic, Google does **not** currently offer a standalone token-counting endpoint. You must use the `countTokens` method in the SDK:

```python
model = genai.GenerativeModel("gemini-3-pro")
count = model.count_tokens("Hello world")
```

---

## 4. Summary Comparison Table

| Feature | OpenAI | Anthropic (Claude) | Google (Gemini) |
|---|---|---|---|
| **Usage in response body** | `usage.prompt_tokens` / `completion_tokens` | `usage.input_tokens` / `output_tokens` | `usageMetadata.promptTokenCount` / `candidatesTokenCount` |
| **Cache token tracking** | `cached_tokens` in details | `cache_read_input_tokens` / `cache_creation_input_tokens` | N/A |
| **Reasoning token tracking** | `reasoning_tokens` | N/A (extended thinking is output tokens) | `thoughtsTokenCount` |
| **Rate limit headers** | `x-ratelimit-*` | `anthropic-ratelimit-*` | Standard HTTP 429 |
| **Standalone token counter** | No (use tiktoken locally) | Yes (`/v1/messages/count_tokens`) | Yes (SDK `count_tokens()`) |
| **Streaming usage location** | Final chunk only | `message_start` + `message_delta` | Final chunk |
| **Usage dashboard API** | Yes (organization-level) | Yes (console API) | Yes (Cloud Billing) |

---

## 5. Windows-Specific Considerations for Your Tool

Your "usage drainage" issue on Windows likely relates to one or more of these:

### Problem: Missing Usage Data in Streaming Mode

On Windows, if you're reading SSE streams with libraries like `httpx` or `requests`, you might be **dropping the final chunk** which contains the usage data. This is a common issue.

**Fix:** Always capture the last event in the stream. Example in Python:

```python
import httpx

total_usage = None
with httpx.stream("POST", url, json=payload, headers=headers) as response:
    for line in response.iter_lines():
        if line.startswith("data: "):
            data = json.loads(line[6:])
            if "usage" in data:
                total_usage = data["usage"]
# total_usage now has your token counts
```

### Problem: System Tray / Taskbar Integration

macOS menubar apps use `NSStatusBar`. On Windows, you need the **system tray (notification area)**. Options:

- **C\#/.NET**: Use `NotifyIcon` (WinForms) or a WPF system tray library
- **Electron/Tauri**: Both support system tray on Windows
- **Python**: Use `pystray` library
- **Rust**: Use `tray-icon` crate (Tauri uses this internally)

### Problem: Intercepting Requests From Other Tools

If you want to track usage from tools like Cursor, VS Code Copilot, or Claude Code running on your machine, you'd need to either:

1. **Proxy approach**: Run a local HTTP proxy (e.g., on `localhost:8080`) that intercepts API calls, extracts `usage` from responses, and forwards everything transparently. Tools like `mitmproxy` can do this.

2. **Log file parsing**: Some tools (like Claude Code CLI) write usage to local log files. Parse those.

3. **API key monitoring**: Use each provider's usage dashboard API, polling it periodically with your API key.

### Problem: Persistent Storage on Windows

Store accumulated usage in:

- **SQLite** (lightweight, no server needed)
- **Windows Registry** (for small config values only)
- `%APPDATA%\YourApp\usage.json` (standard app data location)

---

## 6. Architecture Recommendation for Your Tool

```text
┌─────────────────────────────────┐
│   Windows System Tray App       │
│   (Tauri / Electron / .NET)     │
├─────────────────────────────────┤
│  ┌───────────┐  ┌────────────┐  │
│  │ Local     │  │ Dashboard  │  │
│  │ Proxy     │  │ API Poller │  │
│  │ (optional)│  │ (periodic) │  │
│  └─────┬─────┘  └──────┬─────┘  │
│        │               │        │
│        ▼               ▼        │
│  ┌──────────────────────────┐   │
│  │  SQLite Usage Database   │   │
│  │  (tokens, costs, models) │   │
│  └──────────────────────────┘   │
│        │                        │
│        ▼                        │
│  ┌──────────────────────────┐   │
│  │  Tray Icon + Tooltip     │   │
│  │  "Today: $4.32 | 125K t" │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

Two data collection strategies:
1. **Proxy mode** — intercept live API calls, extract `usage` from responses in real time
2. **Dashboard polling** — hit each provider's usage API every few minutes with your API key

The proxy approach gives real-time data but is harder to set up. Dashboard polling is simpler but has a delay.

---

Let me know if you want me to dive deeper into any specific provider's API, or help you scaffold the Windows app code!

