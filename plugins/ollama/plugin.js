(function () {
  var SETTINGS_URL = "https://ollama.com/settings"
  var PERIOD_MS = 5 * 60 * 60 * 1000
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000
  var SESSION_LABELS = ["Session usage", "Hourly usage"]
  var OLLAMA_PRIVATE_KEY = "~/.ollama/id_ed25519"
  var OLLAMA_PUBLIC_KEY = "~/.ollama/id_ed25519.pub"

  function readCookieHeader(ctx) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") {
      throw "Provider secrets are unavailable in this build."
    }

    try {
      var value = ctx.host.providerSecrets.read("cookieHeader")
      if (typeof value === "string" && value.trim()) {
        return {
          value: value.trim(),
          source: "Stored Cookie header",
        }
      }
    } catch (e) {
      var message = String(e || "").trim()
      ctx.host.log.warn("cookie header read failed: " + message)
      if (message.toLowerCase().indexOf("provider secret not found") !== -1) {
        throw "Stored Ollama cookie header was not found in the system credential vault. Save it again in Setup before refreshing."
      }
      throw "Could not read the stored Ollama cookie header from the system credential vault: " + message
    }

    return null
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      var value = ctx.host.env.get(name)
      return typeof value === "string" && value.trim() ? value.trim() : null
    } catch (e) {
      ctx.host.log.warn("env read failed for " + name + ": " + String(e))
      return null
    }
  }

  function hasLocalSigninKeypair(ctx) {
    if (!ctx.host.fs || typeof ctx.host.fs.exists !== "function") return false
    try {
      return ctx.host.fs.exists(OLLAMA_PRIVATE_KEY) && ctx.host.fs.exists(OLLAMA_PUBLIC_KEY)
    } catch (e) {
      ctx.host.log.warn("Ollama local keypair check failed: " + String(e))
      return false
    }
  }

  function readCloudAuth(ctx) {
    if (readEnv(ctx, "OLLAMA_API_KEY")) {
      return "API key detected"
    }
    if (hasLocalSigninKeypair(ctx)) {
      return "Local signin keys detected"
    }
    return null
  }

  function authOnlyResult(ctx, source) {
    return {
      plan: "Ollama Cloud Auth",
      lines: [
        ctx.line.text({
          label: "Cloud Auth",
          value: source,
        }),
        ctx.line.text({
          label: "Usage",
          value: "Settings cookie required",
        }),
        ctx.line.text({
          label: "Source",
          value: "Cloud auth only; settings cookie required for quota",
        }),
      ],
    }
  }

  function getHeader(headers, name) {
    if (!headers || typeof headers !== "object") return null
    var expected = String(name).toLowerCase()
    var keys = Object.keys(headers)
    for (var i = 0; i < keys.length; i += 1) {
      if (String(keys[i]).toLowerCase() === expected) {
        var value = headers[keys[i]]
        return typeof value === "string" ? value : null
      }
    }
    return null
  }

  function isAuthRedirect(location) {
    if (typeof location !== "string") return false
    var lower = location.toLowerCase()
    return (
      lower.indexOf("/login") !== -1 ||
      lower.indexOf("/signin") !== -1 ||
      lower.indexOf("/auth") !== -1
    )
  }

  function fetchSettingsHtml(ctx, cookieHeader) {
    var resp
    try {
      resp = ctx.host.http.request({
        method: "GET",
        url: SETTINGS_URL,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Cookie: cookieHeader,
          Origin: "https://ollama.com",
          Referer: SETTINGS_URL,
          "User-Agent": "OpenUsage/Ollama",
        },
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("settings request failed: " + String(e))
      throw "Request failed. Check your connection."
    }

    var location = getHeader(resp.headers, "location")
    if (resp.status === 401 || resp.status === 403) {
      throw "Ollama session cookie expired. Paste a fresh Cookie header from ollama.com/settings."
    }
    if (resp.status >= 300 && resp.status < 400 && isAuthRedirect(location)) {
      throw "Not logged in to Ollama. Paste a signed-in Cookie header from ollama.com/settings."
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw "Request failed (HTTP " + resp.status + "). Try again later."
    }

    return typeof resp.bodyText === "string" ? resp.bodyText : ""
  }

  function firstCapture(text, pattern, flags) {
    var regex = new RegExp(pattern, flags || "")
    var match = regex.exec(text)
    return match ? match[1] : null
  }

  function parsePlanName(html) {
    var raw = firstCapture(
      html,
      "Cloud Usage\\s*</span>\\s*<span[^>]*>([^<]+)</span>",
      "i"
    )
    if (!raw) return null
    var trimmed = raw.trim()
    return trimmed || null
  }

  function parsePercent(text) {
    var used = firstCapture(text, "([0-9]+(?:\\.[0-9]+)?)\\s*%\\s*used", "i")
    if (used !== null) {
      var usedNumber = Number(used)
      if (Number.isFinite(usedNumber)) return usedNumber
    }

    var width = firstCapture(text, "width:\\s*([0-9]+(?:\\.[0-9]+)?)%", "i")
    if (width !== null) {
      var widthNumber = Number(width)
      if (Number.isFinite(widthNumber)) return widthNumber
    }

    return null
  }

  function parseUsageBlockByLabel(html, label) {
    var index = html.indexOf(label)
    if (index === -1) return null

    var tail = html.slice(index + label.length, index + label.length + 800)
    var usedPercent = parsePercent(tail)
    if (usedPercent === null) return null

    var resetRaw = firstCapture(tail, 'data-time="([^"]+)"')
    var resetsAt = resetRaw ? toIso(resetRaw) : null

    return {
      usedPercent: usedPercent,
      resetsAt: resetsAt,
    }
  }

  function toIso(value) {
    if (value === null || value === undefined) return null
    if (globalThis.__openusage_ctx && globalThis.__openusage_ctx.util && typeof globalThis.__openusage_ctx.util.toIso === "function") {
      return globalThis.__openusage_ctx.util.toIso(value)
    }
    var date = Date.parse(String(value))
    if (!Number.isFinite(date)) return null
    return new Date(date).toISOString()
  }

  function parseUsageBlock(html, labels) {
    for (var i = 0; i < labels.length; i += 1) {
      var parsed = parseUsageBlockByLabel(html, labels[i])
      if (parsed) return parsed
    }
    return null
  }

  function looksSignedOut(html) {
    var lower = String(html || "").toLowerCase()
    var hasSignInHeading = lower.indexOf("sign in to ollama") !== -1 || lower.indexOf("log in to ollama") !== -1
    var hasAuthRoute =
      lower.indexOf("/api/auth/signin") !== -1 ||
      lower.indexOf("/auth/signin") !== -1 ||
      lower.indexOf('action="/login"') !== -1 ||
      lower.indexOf("action='/login'") !== -1 ||
      lower.indexOf('href="/login"') !== -1 ||
      lower.indexOf("href='/login'") !== -1 ||
      lower.indexOf('action="/signin"') !== -1 ||
      lower.indexOf("action='/signin'") !== -1 ||
      lower.indexOf('href="/signin"') !== -1 ||
      lower.indexOf("href='/signin'") !== -1
    var hasPasswordField = lower.indexOf('type="password"') !== -1 || lower.indexOf("type='password'") !== -1
    var hasEmailField = lower.indexOf('type="email"') !== -1 || lower.indexOf("type='email'") !== -1
    var hasForm = lower.indexOf("<form") !== -1

    if (hasSignInHeading && hasForm && (hasPasswordField || hasEmailField || hasAuthRoute)) return true
    if (hasForm && hasAuthRoute) return true
    return hasForm && hasPasswordField && hasEmailField
  }

  function parseSnapshot(html) {
    var plan = parsePlanName(html)
    var session = parseUsageBlock(html, SESSION_LABELS)
    var weekly = parseUsageBlock(html, ["Weekly usage"])

    if (!session) {
      if (looksSignedOut(html)) {
        throw "Not logged in to Ollama. Paste a signed-in Cookie header from ollama.com/settings."
      }
      throw "Could not parse Ollama usage."
    }

    return {
      plan: plan,
      session: session,
      weekly: weekly,
    }
  }

  function progressLine(ctx, label, used, resetsAt, periodDurationMs) {
    var line = {
      label: label,
      used: used,
      limit: 100,
      format: { kind: "percent" },
      periodDurationMs: periodDurationMs,
    }
    if (resetsAt) line.resetsAt = resetsAt
    return ctx.line.progress(line)
  }

  function probe(ctx) {
    var cookieHeader = readCookieHeader(ctx)
    if (!cookieHeader) {
      var cloudAuth = readCloudAuth(ctx)
      if (cloudAuth) return authOnlyResult(ctx, cloudAuth)
      throw "Paste your Ollama Cookie header in Setup before refreshing, or run `ollama signin` / set OLLAMA_API_KEY for Cloud auth detection."
    }
    var html = fetchSettingsHtml(ctx, cookieHeader.value)
    var snapshot = parseSnapshot(html)

    var lines = [
      progressLine(ctx, "Session", snapshot.session.usedPercent, snapshot.session.resetsAt, PERIOD_MS),
    ]

    if (snapshot.weekly) {
      lines.push(progressLine(ctx, "Weekly", snapshot.weekly.usedPercent, snapshot.weekly.resetsAt, WEEK_MS))
    }
    lines.push(ctx.line.text({ label: "Source", value: "Settings page cookie" }))
    lines.push(ctx.line.text({ label: "Auth source", value: cookieHeader.source }))
    lines.push(ctx.line.text({ label: "Endpoint", value: SETTINGS_URL }))

    return {
      plan: snapshot.plan || undefined,
      lines: lines,
    }
  }

  globalThis.__openusage_plugin = { id: "ollama", probe: probe }
})()
