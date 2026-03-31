(function () {
  const CREDITS_URL = "https://kimi-k2.ai/api/user/credits"
  const API_KEY_ENV_VARS = ["KIMI_K2_API_KEY", "KIMI_API_KEY", "KIMI_KEY"]

  function readString(value) {
    if (typeof value !== "string") return null
    let trimmed = value.trim()
    if (!trimmed) return null
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim()
    }
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }

  function formatCount(value) {
    const n = Number(value || 0)
    if (!Number.isFinite(n)) return "0"
    if (Math.abs(n - Math.round(n)) < 0.000001) return String(Math.round(n))
    return n.toFixed(2)
  }

  function loadApiKey(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("apiKey"))
        if (stored) return stored
      } catch (e) {
        ctx.host.log.warn("provider secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      for (let i = 0; i < API_KEY_ENV_VARS.length; i += 1) {
        const name = API_KEY_ENV_VARS[i]
        try {
          const value = readString(ctx.host.env.get(name))
          if (value) return value
        } catch (e) {
          ctx.host.log.warn("env read failed for " + name + ": " + String(e))
        }
      }
    }

    return null
  }

  function requestCredits(ctx, apiKey) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: CREDITS_URL,
        headers: {
          Authorization: "Bearer " + apiKey,
          Accept: "application/json",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + CREDITS_URL + "): " + String(e))
      throw "Kimi K2 request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Kimi K2 API key invalid. Check Setup or KIMI_K2_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Kimi K2 request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Kimi K2 response invalid. Try again later."
    }

    return { data, headers: resp.headers || {} }
  }

  function collectContexts(root) {
    const contexts = []
    function addContext(value) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        contexts.push(value)
      }
    }

    addContext(root)
    addContext(root.data)
    addContext(root.result)
    addContext(root.usage)
    addContext(root.credits)
    if (root.data) {
      addContext(root.data.usage)
      addContext(root.data.credits)
    }
    if (root.result) {
      addContext(root.result.usage)
      addContext(root.result.credits)
    }
    return contexts
  }

  function readPath(contexts, paths) {
    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i]
      for (let j = 0; j < contexts.length; j += 1) {
        let value = contexts[j]
        let valid = true
        for (let k = 0; k < path.length; k += 1) {
          const key = path[k]
          if (!value || typeof value !== "object" || Array.isArray(value) || !(key in value)) {
            valid = false
            break
          }
          value = value[key]
        }
        if (valid) return value
      }
    }
    return null
  }

  function readHeaderNumber(headers, targetName) {
    if (!headers || typeof headers !== "object") return null
    const names = Object.keys(headers)
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i]
      if (String(name).toLowerCase() !== targetName.toLowerCase()) continue
      return readNumber(headers[name])
    }
    return null
  }

  function parseSummary(payload, headers) {
    const contexts = collectContexts(payload)
    const consumed = readNumber(readPath(contexts, [
      ["total_credits_consumed"],
      ["totalCreditsConsumed"],
      ["total_credits_used"],
      ["totalCreditsUsed"],
      ["credits_consumed"],
      ["creditsConsumed"],
      ["consumedCredits"],
      ["usedCredits"],
      ["total"],
      ["usage", "total"],
      ["usage", "consumed"],
    ])) ?? 0

    const remaining = readNumber(readPath(contexts, [
      ["credits_remaining"],
      ["creditsRemaining"],
      ["remaining_credits"],
      ["remainingCredits"],
      ["available_credits"],
      ["availableCredits"],
      ["credits_left"],
      ["creditsLeft"],
      ["usage", "credits_remaining"],
      ["usage", "remaining"],
    ])) ?? readHeaderNumber(headers, "x-credits-remaining") ?? 0

    const averageTokens = readNumber(readPath(contexts, [
      ["average_tokens_per_request"],
      ["averageTokensPerRequest"],
      ["average_tokens"],
      ["averageTokens"],
      ["avg_tokens"],
      ["avgTokens"],
    ]))

    return {
      consumed: Math.max(0, consumed),
      remaining: Math.max(0, remaining),
      averageTokens,
    }
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) {
      throw "Kimi K2 API key missing. Save it in Setup or set KIMI_K2_API_KEY."
    }

    const response = requestCredits(ctx, apiKey)
    const summary = parseSummary(response.data, response.headers)
    const total = summary.consumed + summary.remaining

    const lines = [
      ctx.line.progress({
        label: "Credits",
        used: summary.consumed,
        limit: Math.max(total, summary.consumed, 1),
        format: { kind: "count", suffix: "credits" },
      }),
      ctx.line.text({
        label: "Average tokens",
        value: summary.averageTokens === null ? "Unavailable" : formatCount(summary.averageTokens),
      }),
    ]

    return {
      plan: "Remaining: " + formatCount(summary.remaining),
      lines,
    }
  }

  globalThis.__openusage_plugin = { id: "kimi-k2", probe }
})()
