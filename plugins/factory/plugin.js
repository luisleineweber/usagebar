;(function () {
  const AUTH_V2_FILE = "~/.factory/auth.v2.file"
  const AUTH_V2_KEY = "~/.factory/auth.v2.key"
  const AUTH_PATHS = ["~/.factory/auth.encrypted", "~/.factory/auth.json"]
  const KEYCHAIN_SERVICES = ["Factory Token", "Factory token", "Factory Auth", "Droid Auth"]
  const WORKOS_CLIENT_ID = "client_01HNM792M5G5G1A2THWPXKFMXB"
  const WORKOS_AUTH_URL = "https://api.workos.com/user_management/authenticate"
  const USAGE_URL = "https://api.factory.ai/api/organization/subscription/usage"
  const TOKEN_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours before expiry
  const API_KEY_SECRET = "apiKey"

  function decodeHexUtf8(hex) {
    try {
      const bytes = []
      for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16))
      }

      if (typeof TextDecoder !== "undefined") {
        try {
          return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
        } catch {
          // TextDecoder is unavailable or rejected the input; use the fallback decoder below.
        }
      }

      let escaped = ""
      for (const b of bytes) {
        const h = b.toString(16)
        escaped += "%" + (h.length === 1 ? "0" + h : h)
      }
      return decodeURIComponent(escaped)
    } catch {
      return null
    }
  }

  function tryParseAuthJson(ctx, text) {
    if (!text) return null
    const parsed = ctx.util.tryParseJson(text)
    if (parsed !== null) return parsed

    // Some keychain payloads can be returned as hex-encoded UTF-8 bytes.
    let hex = String(text).trim()
    if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2)
    if (!hex || hex.length % 2 !== 0) return null
    if (!/^[0-9a-fA-F]+$/.test(hex)) return null

    const decoded = decodeHexUtf8(hex)
    if (!decoded) return null
    return ctx.util.tryParseJson(decoded)
  }

  function looksLikeJwt(value) {
    return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value)
  }

  function normalizeAuthPayload(raw, opts) {
    const allowPartial = Boolean(opts && opts.allowPartial)
    if (!raw || typeof raw !== "object") return null

    const accessToken =
      raw.access_token ||
      raw.accessToken ||
      (raw.tokens && (raw.tokens.access_token || raw.tokens.accessToken))

    const refreshToken =
      raw.refresh_token ||
      raw.refreshToken ||
      (raw.tokens && (raw.tokens.refresh_token || raw.tokens.refreshToken))

    const hasAccess = typeof accessToken === "string" && accessToken
    const hasRefresh = typeof refreshToken === "string" && refreshToken
    if (!hasAccess && !(allowPartial && hasRefresh)) return null

    return {
      access_token: hasAccess ? accessToken : null,
      refresh_token: hasRefresh ? refreshToken : null,
    }
  }

  function parseAuthPayload(ctx, rawText, opts) {
    const parsed = tryParseAuthJson(ctx, rawText)
    const normalized = normalizeAuthPayload(parsed, opts)
    if (normalized) return normalized

    if (typeof parsed === "string" && looksLikeJwt(parsed)) {
      return { access_token: parsed, refresh_token: null }
    }

    const direct = String(rawText || "").trim()
    if (looksLikeJwt(direct)) {
      return { access_token: direct, refresh_token: null }
    }

    return null
  }

  function loadAuthFromFiles(ctx) {
    if (
      ctx.host.crypto &&
      typeof ctx.host.crypto.decryptAes256Gcm === "function" &&
      ctx.host.fs.exists(AUTH_V2_FILE) &&
      ctx.host.fs.exists(AUTH_V2_KEY)
    ) {
      try {
        const envelope = ctx.host.fs.readText(AUTH_V2_FILE)
        const keyB64 = String(ctx.host.fs.readText(AUTH_V2_KEY) || "").trim()
        const decrypted = ctx.host.crypto.decryptAes256Gcm(envelope, keyB64)
        const auth = parseAuthPayload(ctx, decrypted, { allowPartial: true })
        if (auth) {
          ctx.host.log.info("auth loaded from file: " + AUTH_V2_FILE)
          return {
            auth,
            source: "file-v2",
            authPath: AUTH_V2_FILE,
            authKeyPath: AUTH_V2_KEY,
            keychainService: null,
          }
        }
        ctx.host.log.warn("auth file exists but has no valid auth payload: " + AUTH_V2_FILE)
      } catch (e) {
        ctx.host.log.warn("auth v2 file read failed: " + String(e))
      }
    }

    for (const authPath of AUTH_PATHS) {
      if (!ctx.host.fs.exists(authPath)) continue

      try {
        const text = ctx.host.fs.readText(authPath)
        const auth = parseAuthPayload(ctx, text, { allowPartial: true })
        if (!auth) {
          ctx.host.log.warn("auth file exists but has no valid auth payload: " + authPath)
          continue
        }
        ctx.host.log.info("auth loaded from file: " + authPath)
        return { auth, source: "file", authPath, keychainService: null }
      } catch (e) {
        ctx.host.log.warn("auth file read failed: " + String(e))
      }
    }

    return null
  }

  function loadAuthFromKeychain(ctx) {
    if (!ctx.host.keychain || typeof ctx.host.keychain.readGenericPassword !== "function") {
      return null
    }

    for (const service of KEYCHAIN_SERVICES) {
      try {
        const value = ctx.host.keychain.readGenericPassword(service)
        if (!value) continue

        const auth = parseAuthPayload(ctx, value)
        if (!auth) {
          ctx.host.log.warn("keychain has data but no valid auth payload: " + service)
          continue
        }

        ctx.host.log.info("auth loaded from keychain: " + service)
        return { auth, source: "keychain", authPath: null, keychainService: service }
      } catch (e) {
        ctx.host.log.info("keychain read failed (may not exist): " + String(e))
      }
    }

    return null
  }

  // A bearer token must not contain whitespace or control characters.
  function isHeaderSafeToken(value) {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i)
      if (code <= 0x20 || code === 0x7f || /\s/.test(value[i])) return false
    }
    return true
  }

  // Returns the trimmed key, or null when no key is saved. Vault failures stay visible.
  function loadStoredApiKey(ctx) {
    const secrets = ctx.host.providerSecrets
    if (!secrets || typeof secrets.read !== "function") {
      throw "Provider secrets are unavailable in this build."
    }

    let value
    try {
      value = secrets.read(API_KEY_SECRET)
    } catch (e) {
      const message = String(e || "").trim()
      if (message.toLowerCase().indexOf("provider secret not found") !== -1) return null
      ctx.host.log.error("api key read failed: " + message)
      throw (
        "Could not read the stored Factory API key from the credential vault: " +
        message +
        ". Save it again in Setup, or remove it to use the local droid login."
      )
    }

    if (typeof value !== "string" || !value.trim()) return null
    const apiKey = value.trim()
    if (!isHeaderSafeToken(apiKey)) {
      ctx.host.log.error("stored api key contains whitespace or control characters")
      throw "Stored Factory API key is malformed. Save it again in Setup."
    }
    return apiKey
  }

  function loadAuth(ctx) {
    const fileAuth = loadAuthFromFiles(ctx)
    if (fileAuth) return fileAuth

    const keychainAuth = loadAuthFromKeychain(ctx)
    if (keychainAuth) return keychainAuth

    if (!ctx.host.fs.exists(AUTH_V2_FILE)) {
      ctx.host.log.warn("auth file not found: " + AUTH_V2_FILE)
    }

    for (const authPath of AUTH_PATHS) {
      if (!ctx.host.fs.exists(authPath)) {
        ctx.host.log.warn("auth file not found: " + authPath)
      }
    }

    return null
  }

  function saveAuth(ctx, authState) {
    const auth = authState && authState.auth ? authState.auth : null
    if (!auth) return false

    try {
      if (authState.source === "file-v2" && authState.authPath && authState.authKeyPath) {
        if (!ctx.host.crypto || typeof ctx.host.crypto.encryptAes256Gcm !== "function") {
          ctx.host.log.warn("auth v2 persistence skipped: crypto host API unavailable")
          return false
        }
        const keyB64 = String(ctx.host.fs.readText(authState.authKeyPath) || "").trim()
        const envelope = ctx.host.crypto.encryptAes256Gcm(JSON.stringify(auth, null, 2), keyB64)
        ctx.host.fs.writeText(authState.authPath, envelope)
        ctx.host.log.info("auth file updated: " + authState.authPath)
        return true
      }

      if (authState.source === "file" && authState.authPath) {
        ctx.host.fs.writeText(authState.authPath, JSON.stringify(auth, null, 2))
        ctx.host.log.info("auth file updated: " + authState.authPath)
        return true
      }

      if (
        authState.source === "keychain" &&
        authState.keychainService &&
        ctx.host.keychain &&
        typeof ctx.host.keychain.writeGenericPassword === "function"
      ) {
        ctx.host.keychain.writeGenericPassword(authState.keychainService, JSON.stringify(auth))
        ctx.host.log.info("auth keychain item updated: " + authState.keychainService)
        return true
      }

      ctx.host.log.warn("auth persistence skipped: unsupported source")
      return false
    } catch (e) {
      ctx.host.log.warn("failed to save auth: " + String(e))
      return false
    }
  }

  function needsRefresh(ctx, accessToken, nowMs) {
    const payload = ctx.jwt.decodePayload(accessToken)
    const expiresAtMs = payload && typeof payload.exp === "number" ? payload.exp * 1000 : null
    return ctx.util.needsRefreshByExpiry({
      nowMs,
      expiresAtMs,
      bufferMs: TOKEN_REFRESH_THRESHOLD_MS,
    })
  }

  function refreshToken(ctx, authState) {
    const auth = authState.auth
    if (!auth.refresh_token) {
      ctx.host.log.warn("refresh skipped: no refresh token")
      return null
    }

    ctx.host.log.info("attempting token refresh via WorkOS")
    try {
      const resp = ctx.util.request({
        method: "POST",
        url: WORKOS_AUTH_URL,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        bodyText:
          "grant_type=refresh_token" +
          "&refresh_token=" +
          encodeURIComponent(auth.refresh_token) +
          "&client_id=" +
          encodeURIComponent(WORKOS_CLIENT_ID),
        timeoutMs: 15000,
      })

      if (resp.status === 400 || resp.status === 401) {
        ctx.host.log.error("refresh failed: status=" + resp.status)
        throw "Session expired. Run `droid` to log in again."
      }
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("refresh returned unexpected status: " + resp.status)
        return null
      }

      const body = ctx.util.tryParseJson(resp.bodyText)
      if (!body) {
        ctx.host.log.warn("refresh response not valid JSON")
        return null
      }
      const newAccessToken = body.access_token
      if (!newAccessToken) {
        ctx.host.log.warn("refresh response missing access_token")
        return null
      }

      // Update auth object with new tokens
      auth.access_token = newAccessToken
      if (body.refresh_token) {
        auth.refresh_token = body.refresh_token
      }

      // Save updated auth
      saveAuth(ctx, authState)
      ctx.host.log.info("refresh succeeded")

      return newAccessToken
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("refresh exception: " + String(e))
      return null
    }
  }

  function fetchUsage(ctx, accessToken) {
    const url = USAGE_URL + "?useCache=true"
    return ctx.util.request({
      method: "GET",
      url: url,
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "OpenUsage",
      },
      timeoutMs: 10000,
    })
  }

  function probeWithApiKey(ctx, apiKey) {
    ctx.host.log.info("auth source: stored Factory API key")
    let resp
    try {
      resp = fetchUsage(ctx, apiKey)
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    // An explicit API key is strict: no refresh and no fallback to the local droid login.
    if (resp.status === 401) {
      ctx.host.log.error("usage rejected stored api key: status=401")
      throw "Factory API key was rejected (HTTP 401). Replace it in Setup, or remove it to use the local droid login."
    }
    if (resp.status === 403) {
      ctx.host.log.error("usage denied for stored api key: status=403")
      throw "Factory API key cannot read subscription usage (HTTP 403). Use a key with access to this organization, or remove it to use the local droid login."
    }
    return mapUsageResponse(ctx, resp)
  }

  function probeWithSession(ctx) {
    const authState = loadAuth(ctx)
    if (!authState) {
      ctx.host.log.error("probe failed: not logged in")
      throw "Not logged in. Save a Factory API key in Setup, or run `droid` to authenticate, then refresh Factory."
    }

    const auth = authState.auth
    if (!auth.access_token) {
      ctx.host.log.error("probe failed: no access_token in auth data")
      throw "Invalid auth file. Run `droid` to authenticate."
    }

    let accessToken = auth.access_token

    // Check if token needs refresh
    const nowMs = Date.now()
    if (needsRefresh(ctx, accessToken, nowMs)) {
      ctx.host.log.info("token near expiry, refreshing")
      const refreshed = refreshToken(ctx, authState)
      if (refreshed) {
        accessToken = refreshed
      } else {
        ctx.host.log.warn("proactive refresh failed, trying with existing token")
      }
    }

    let resp
    let didRefresh = false
    try {
      resp = ctx.util.retryOnceOnAuth({
        request: (token) => {
          try {
            return fetchUsage(ctx, token || accessToken)
          } catch (e) {
            ctx.host.log.error("usage request exception: " + String(e))
            if (didRefresh) {
              throw "Usage request failed after refresh. Try again."
            }
            throw "Usage request failed. Check your connection."
          }
        },
        refresh: () => {
          ctx.host.log.info("usage returned 401, attempting refresh")
          didRefresh = true
          return refreshToken(ctx, authState)
        },
      })
    } catch (e) {
      if (typeof e === "string") throw e
      ctx.host.log.error("usage request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      ctx.host.log.error("usage returned auth error after all retries: status=" + resp.status)
      throw "Token expired. Run `droid` to log in again."
    }

    return mapUsageResponse(ctx, resp)
  }

  function tokenProgressLine(ctx, label, bucket, resetsAt, periodDurationMs) {
    if (!bucket || typeof bucket !== "object") return null
    const limit = bucket.totalAllowance
    // A missing or zero allowance means the plan has no quota for this bucket.
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null

    const used = bucket.orgTotalTokensUsed
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0) {
      ctx.host.log.error("usage " + label + " allowance has no valid orgTotalTokensUsed")
      throw "Usage response missing token counts. Try again later."
    }

    return ctx.line.progress({
      label: label,
      used: used,
      limit: limit,
      format: { kind: "count", suffix: "tokens" },
      resetsAt: resetsAt,
      periodDurationMs: periodDurationMs,
    })
  }

  function mapUsageResponse(ctx, resp) {
    if (resp.status === 429) {
      ctx.host.log.warn("usage rate limited: status=429")
      throw "Factory rate limit reached (HTTP 429). Try again later."
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status)
      throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    ctx.host.log.info("usage fetch succeeded")

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (data === null) {
      throw "Usage response invalid. Try again later."
    }

    const usage = data.usage
    if (!usage || typeof usage !== "object") {
      throw "Usage response missing data. Try again later."
    }

    // Calculate reset time and period from usage dates
    const endDate = usage.endDate
    const startDate = usage.startDate
    const resetsAt = typeof endDate === "number" ? ctx.util.toIso(endDate) : null
    const periodDurationMs =
      typeof endDate === "number" && typeof startDate === "number" ? endDate - startDate : null

    const lines = []
    const standard = tokenProgressLine(ctx, "Standard", usage.standard, resetsAt, periodDurationMs)
    if (standard) lines.push(standard)
    // Premium is a detail line and appears only when the plan includes premium tokens.
    const premium = tokenProgressLine(ctx, "Premium", usage.premium, resetsAt, periodDurationMs)
    if (premium) lines.push(premium)

    if (lines.length === 0) {
      lines.push(ctx.line.badge({ label: "Status", text: "No usage data", color: "#a3a3a3" }))
    }

    return { plan: null, lines: lines }
  }

  // Precedence: a saved API key is an explicit choice and wins over the local droid login.
  function probe(ctx) {
    const apiKey = loadStoredApiKey(ctx)
    if (apiKey) return probeWithApiKey(ctx, apiKey)
    return probeWithSession(ctx)
  }

  function addCcusageHistory(ctx, result) {
    if (
      !result ||
      result.history ||
      !ctx.host.ccusage ||
      typeof ctx.host.ccusage.query !== "function"
    )
      return result
    var sinceDate = new Date(ctx.nowIso || Date.now())
    sinceDate.setDate(sinceDate.getDate() - 30)
    var since =
      sinceDate.getFullYear() +
      String(sinceDate.getMonth() + 1).padStart(2, "0") +
      String(sinceDate.getDate()).padStart(2, "0")
    var usage = ctx.host.ccusage.query({ provider: "droid", since: since })
    var daily =
      usage && usage.status === "ok" && usage.data && Array.isArray(usage.data.daily)
        ? usage.data.daily
        : []
    var entries = []
    for (var i = 0; i < daily.length; i += 1) {
      var m = String((daily[i] && daily[i].date) || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!m) continue
      var start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      var end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1)
      var row = daily[i],
        entry = { periodStart: start.toISOString(), periodEnd: end.toISOString() }
      var input = Number(row.inputTokens),
        output = Number(row.outputTokens),
        cacheRead = Number(row.cacheReadTokens),
        cacheCreation = Number(row.cacheCreationTokens),
        reasoning = Number(row.reasoningTokens),
        total = Number(row.totalTokens),
        cost = Number(row.totalCost)
      if (Number.isFinite(input) && input >= 0) entry.inputTokens = input
      if (Number.isFinite(output) && output >= 0) entry.outputTokens = output
      if (Number.isFinite(cacheRead) && cacheRead >= 0) entry.cacheReadTokens = cacheRead
      if (Number.isFinite(cacheCreation) && cacheCreation >= 0)
        entry.cacheCreationTokens = cacheCreation
      if (Number.isFinite(reasoning) && reasoning >= 0) entry.reasoningTokens = reasoning
      if (Number.isFinite(total) && total >= 0) entry.totalTokens = total
      if (Number.isFinite(cost) && cost >= 0) entry.costUsd = cost
      if (Object.keys(entry).length > 2) entries.push(entry)
    }
    if (entries.length)
      result.history = { version: 1, source: "ccusage", timeZone: "system-local", entries: entries }
    return result
  }
  var probeCore = probe
  globalThis.__openusage_plugin = {
    id: "factory",
    probe: function (ctx) {
      return addCcusageHistory(ctx, probeCore(ctx))
    },
  }
})()
