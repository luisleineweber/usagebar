(function () {
  const API_URL = "https://app.warp.dev/graphql/v2?op=GetRequestLimitInfo"
  const API_KEY_ENV_VARS = ["WARP_API_KEY", "WARP_TOKEN"]
  const GRAPHQL_QUERY = ""
    + "query GetRequestLimitInfo($requestContext: RequestContext!) { "
    + "user(requestContext: $requestContext) { "
    + "__typename "
    + "... on UserOutput { "
    + "user { requestLimitInfo { isUnlimited nextRefreshTime requestLimit requestsUsedSinceLastRefresh } } "
    + "} "
    + "} "
    + "}"

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

  function readBoolean(value) {
    if (typeof value === "boolean") return value
    const text = readString(value)
    if (!text) return null
    if (text.toLowerCase() === "true") return true
    if (text.toLowerCase() === "false") return false
    return null
  }

  function loadToken(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("token"))
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

  function parseTimestamp(value) {
    const text = readString(value)
    if (!text) return null
    const ms = Date.parse(text)
    if (!Number.isFinite(ms)) return null
    return new Date(ms).toISOString()
  }

  function requestUsage(ctx, token) {
    let resp
    try {
      resp = ctx.util.request({
        method: "POST",
        url: API_URL,
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-warp-client-id": "warp-app",
          "User-Agent": "Warp/1.0",
        },
        bodyText: JSON.stringify({
          query: GRAPHQL_QUERY,
          variables: {
            requestContext: {
              clientContext: {},
              osContext: {
                category: "Windows",
                name: "Windows",
                version: "10.0",
              },
            },
          },
          operationName: "GetRequestLimitInfo",
        }),
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("request failed (" + API_URL + "): " + String(e))
      throw "Warp request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Warp token invalid. Check Setup or WARP_API_KEY."
    }

    if (resp.status < 200 || resp.status >= 300) {
      throw "Warp request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      throw "Warp response invalid. Try again later."
    }

    return data
  }

  function parseUsage(payload) {
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const message = payload.errors
        .map((item) => (item && typeof item === "object" ? readString(item.message) : null))
        .find(Boolean)
      throw message ? "Warp API error: " + message : "Warp API error. Try again later."
    }

    const userRoot = payload.data && payload.data.user
    const user = userRoot && typeof userRoot === "object" ? userRoot.user : null
    const limitInfo = user && typeof user === "object" ? user.requestLimitInfo : null
    if (!limitInfo || typeof limitInfo !== "object") {
      throw "Warp response invalid. Try again later."
    }

    const isUnlimited = readBoolean(limitInfo.isUnlimited) === true
    const requestLimit = readNumber(limitInfo.requestLimit) ?? 0
    const requestsUsed = readNumber(limitInfo.requestsUsedSinceLastRefresh) ?? 0
    const resetsAt = parseTimestamp(limitInfo.nextRefreshTime)

    return {
      isUnlimited,
      requestLimit: Math.max(0, requestLimit),
      requestsUsed: Math.max(0, requestsUsed),
      resetsAt,
    }
  }

  function probe(ctx) {
    const token = loadToken(ctx)
    if (!token) {
      throw "Warp token missing. Save it in Setup or set WARP_API_KEY."
    }

    const usage = parseUsage(requestUsage(ctx, token))
    const progress = {
      label: "Requests",
      used: usage.isUnlimited ? 0 : usage.requestsUsed,
      limit: usage.isUnlimited ? 1 : Math.max(usage.requestLimit, usage.requestsUsed, 1),
      format: { kind: "count", suffix: "credits" },
    }
    if (!usage.isUnlimited && usage.resetsAt) {
      progress.resetsAt = usage.resetsAt
    }

    return {
      lines: [
        ctx.line.progress(progress),
        ctx.line.badge({
          label: "Plan",
          text: usage.isUnlimited ? "Unlimited" : "Metered",
        }),
      ],
    }
  }

  globalThis.__openusage_plugin = { id: "warp", probe }
})()
