(function () {
  var LS_SERVICE = "exa.language_server_pb.LanguageServerService"
  var CLOUD_SERVICE = "exa.seat_management_pb.SeatManagementService"
  var CLOUD_URL = "https://server.codeium.com"
  var WINDOWS_PRODUCT_PATHS = [
    "D:/Windsurf/resources/app/product.json",
    "~/AppData/Local/Programs/Windsurf/resources/app/product.json",
    "C:/Program Files/Windsurf/resources/app/product.json",
    "C:/Program Files (x86)/Windsurf/resources/app/product.json",
  ]
  var WINDOWS_NEXT_PRODUCT_PATHS = [
    "D:/Windsurf - Next/resources/app/product.json",
    "~/AppData/Local/Programs/Windsurf - Next/resources/app/product.json",
    "C:/Program Files/Windsurf - Next/resources/app/product.json",
    "C:/Program Files (x86)/Windsurf - Next/resources/app/product.json",
  ]
  var WINDOWS_PACKAGE_PATHS = [
    "D:/Windsurf/resources/app/package.json",
    "~/AppData/Local/Programs/Windsurf/resources/app/package.json",
    "C:/Program Files/Windsurf/resources/app/package.json",
    "C:/Program Files (x86)/Windsurf/resources/app/package.json",
  ]
  var WINDOWS_NEXT_PACKAGE_PATHS = [
    "D:/Windsurf - Next/resources/app/package.json",
    "~/AppData/Local/Programs/Windsurf - Next/resources/app/package.json",
    "C:/Program Files/Windsurf - Next/resources/app/package.json",
    "C:/Program Files (x86)/Windsurf - Next/resources/app/package.json",
  ]

  // Windsurf variants - tried in order (Windsurf first, then Windsurf Next).
  // Markers use --ide_name exact matching in the Rust discover code.
  var VARIANTS = [
    {
      marker: "windsurf",
      ideName: "windsurf",
      darwinStateDb: "~/Library/Application Support/Windsurf/User/globalStorage/state.vscdb",
      windowsStateDb: "~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb",
      appPlist: "/Applications/Windsurf.app/Contents/Info.plist",
      windowsProductPaths: WINDOWS_PRODUCT_PATHS,
      windowsPackagePaths: WINDOWS_PACKAGE_PATHS,
    },
    {
      marker: "windsurf-next",
      ideName: "windsurf-next",
      darwinStateDb: "~/Library/Application Support/Windsurf - Next/User/globalStorage/state.vscdb",
      windowsStateDb: "~/AppData/Roaming/Windsurf - Next/User/globalStorage/state.vscdb",
      appPlist: "/Applications/Windsurf - Next.app/Contents/Info.plist",
      windowsProductPaths: WINDOWS_NEXT_PRODUCT_PATHS,
      windowsPackagePaths: WINDOWS_NEXT_PACKAGE_PATHS,
    },
  ]

  function stateDbPath(ctx, variant) {
    if (ctx.app.platform === "windows") return variant.windowsStateDb || variant.darwinStateDb
    return variant.darwinStateDb
  }

  function lsProcessName(ctx) {
    if (ctx.app.platform === "windows") return "language_server_windows"
    if (ctx.app.platform === "linux") return "language_server_linux"
    return "language_server_macos"
  }

  function lsOsName(ctx) {
    if (ctx.app.platform === "windows") return "windows"
    if (ctx.app.platform === "linux") return "linux"
    return "macos"
  }

  function trimString(value) {
    if (value === null || value === undefined) return null
    var text = String(value).trim()
    return text || null
  }

  function readJsonFile(ctx, path) {
    if (!path || !ctx.host.fs || !ctx.host.fs.exists || !ctx.host.fs.readText) return null
    if (!ctx.host.fs.exists(path)) return null
    return ctx.util.tryParseJson(ctx.host.fs.readText(path))
  }

  function loadWindowsInstalledMetadata(ctx, variant) {
    var productPaths = variant.windowsProductPaths || []
    for (var i = 0; i < productPaths.length; i++) {
      try {
        var product = readJsonFile(ctx, productPaths[i])
        if (!product || typeof product !== "object") continue
        var ideVersion = trimString(product.windsurfVersion) || trimString(product.version)
        var extensionVersion = trimString(product.codeiumVersion) || ideVersion
        if (ideVersion || extensionVersion) {
          return {
            ideVersion: ideVersion || extensionVersion,
            extensionVersion: extensionVersion || ideVersion,
          }
        }
      } catch (e) {
        ctx.host.log.warn("failed to read product metadata for " + variant.marker + ": " + String(e))
      }
    }

    var packagePaths = variant.windowsPackagePaths || []
    for (var j = 0; j < packagePaths.length; j++) {
      try {
        var pkg = readJsonFile(ctx, packagePaths[j])
        var pkgVersion = pkg && typeof pkg === "object" ? trimString(pkg.version) : null
        if (!pkgVersion) continue
        return { ideVersion: pkgVersion, extensionVersion: pkgVersion }
      } catch (e2) {
        ctx.host.log.warn("failed to read package metadata for " + variant.marker + ": " + String(e2))
      }
    }

    return null
  }

  function loadDarwinInstalledMetadata(ctx, variant) {
    var path = variant && variant.appPlist
    if (!path) return null
    try {
      if (!ctx.host.fs || !ctx.host.fs.exists || !ctx.host.fs.readText) return null
      if (!ctx.host.fs.exists(path)) return null
      var text = ctx.host.fs.readText(path)
      if (!text) return null
      var match = String(text).match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)
      if (!match || !match[1]) return null
      var version = String(match[1]).trim() || null
      if (!version) return null
      return { ideVersion: version, extensionVersion: version }
    } catch (e) {
      ctx.host.log.warn("failed to read installed version for " + variant.marker + ": " + String(e))
      return null
    }
  }

  function loadInstalledMetadata(ctx, variant) {
    if (ctx.app.platform === "windows") return loadWindowsInstalledMetadata(ctx, variant)
    return loadDarwinInstalledMetadata(ctx, variant)
  }

  // --- LS discovery ---

  function discoverLs(ctx, variant) {
    return ctx.host.ls.discover({
      processName: lsProcessName(ctx),
      markers: [variant.marker],
      csrfFlag: "--csrf_token",
      portFlag: "--extension_server_port",
      extraFlags: ["--windsurf_version"],
    })
  }

  function loadApiKey(ctx, variant) {
    try {
      var rows = ctx.host.sqlite.query(
        stateDbPath(ctx, variant),
        "SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1"
      )
      var parsed = ctx.util.tryParseJson(rows)
      if (!parsed || !parsed.length || !parsed[0].value) return null
      var auth = ctx.util.tryParseJson(parsed[0].value)
      if (!auth || !auth.apiKey) return null
      return auth.apiKey
    } catch (e) {
      ctx.host.log.warn("failed to read API key from " + variant.marker + ": " + String(e))
      return null
    }
  }

  function probePort(ctx, scheme, port, csrf, ideName) {
    ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/GetUnleashData",
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify({
        context: {
          properties: {
            devMode: "false",
            extensionVersion: "unknown",
            ide: ideName,
            ideVersion: "unknown",
            os: lsOsName(ctx),
          },
        },
      }),
      timeoutMs: 5000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    return true
  }

  function findWorkingPort(ctx, discovery, ideName) {
    var ports = discovery.ports || []
    for (var i = 0; i < ports.length; i++) {
      var port = ports[i]
      try { if (probePort(ctx, "https", port, discovery.csrf, ideName)) return { port: port, scheme: "https" } } catch (e) { /* ignore */ }
      try { if (probePort(ctx, "http", port, discovery.csrf, ideName)) return { port: port, scheme: "http" } } catch (e) { /* ignore */ }
      ctx.host.log.info("port " + port + " probe failed on both schemes")
    }
    if (discovery.extensionPort) return { port: discovery.extensionPort, scheme: "http" }
    return null
  }

  function callLs(ctx, port, scheme, csrf, method, body) {
    var resp = ctx.host.http.request({
      method: "POST",
      url: scheme + "://127.0.0.1:" + port + "/" + LS_SERVICE + "/" + method,
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        "x-codeium-csrf-token": csrf,
      },
      bodyText: JSON.stringify(body || {}),
      timeoutMs: 10000,
      dangerouslyIgnoreTls: scheme === "https",
    })
    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.warn("callLs " + method + " returned " + resp.status)
      return null
    }
    return ctx.util.tryParseJson(resp.bodyText)
  }

  // --- Credit line builder ---

  function creditLine(ctx, label, used, total, resetsAt, periodMs) {
    if (typeof total !== "number" || total <= 0) return null
    if (typeof used !== "number") used = 0
    if (used < 0) used = 0
    var line = {
      label: label,
      used: used,
      limit: total,
      format: { kind: "count", suffix: "credits" },
    }
    if (resetsAt) line.resetsAt = resetsAt
    if (periodMs) line.periodDurationMs = periodMs
    return ctx.line.progress(line)
  }

  function billingPeriodMs(planStart, planEnd) {
    if (!planStart || !planEnd) return null
    var startMs = Date.parse(planStart)
    var endMs = Date.parse(planEnd)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
    return endMs - startMs
  }

  function buildPlanLines(ctx, userStatus) {
    var ps = (userStatus && userStatus.planStatus) || {}
    var pi = ps.planInfo || {}
    var plan = pi.planName || null
    var planEnd = ps.planEnd || null
    var periodMs = billingPeriodMs(ps.planStart || null, planEnd)

    var lines = []

    var promptTotal = ps.availablePromptCredits
    var promptUsed = ps.usedPromptCredits || 0
    if (typeof promptTotal === "number" && promptTotal > 0) {
      var pl = creditLine(ctx, "Prompt credits", promptUsed / 100, promptTotal / 100, planEnd, periodMs)
      if (pl) lines.push(pl)
    }

    var flexTotal = ps.availableFlexCredits
    var flexUsed = ps.usedFlexCredits || 0
    if (typeof flexTotal === "number" && flexTotal > 0) {
      var xl = creditLine(ctx, "Flex credits", flexUsed / 100, flexTotal / 100, null, null)
      if (xl) lines.push(xl)
    }

    if (lines.length === 0) {
      lines.push(ctx.line.badge({ label: "Credits", text: "Unlimited" }))
    }

    return { plan: plan, lines: lines }
  }

  // --- LS probe for a specific variant ---

  function probeVariant(ctx, variant) {
    var discovery = discoverLs(ctx, variant)
    if (!discovery) return null

    var found = findWorkingPort(ctx, discovery, variant.ideName)
    if (!found) return null

    var apiKey = loadApiKey(ctx, variant)
    if (!apiKey) {
      ctx.host.log.warn("no API key found in SQLite for " + variant.marker)
      return null
    }

    var installed = loadInstalledMetadata(ctx, variant)
    var ideVersion = (discovery.extra && discovery.extra.windsurf_version) ||
      (installed && installed.ideVersion) ||
      "unknown"
    var extensionVersion = (installed && installed.extensionVersion) || ideVersion

    var metadata = {
      apiKey: apiKey,
      ideName: variant.ideName,
      ideVersion: ideVersion,
      extensionName: variant.ideName,
      extensionVersion: extensionVersion,
      locale: "en",
    }

    var data = null
    try {
      data = callLs(ctx, found.port, found.scheme, discovery.csrf, "GetUserStatus", { metadata: metadata })
    } catch (e) {
      ctx.host.log.warn("GetUserStatus threw for " + variant.marker + ": " + String(e))
    }

    if (!data || !data.userStatus) return null

    return buildPlanLines(ctx, data.userStatus)
  }

  // --- Cloud fallback ---

  function callCloud(ctx, apiKey, variant) {
    var installed = loadInstalledMetadata(ctx, variant) || {}
    var ideVersion = installed.ideVersion || "0.0.0"
    var extensionVersion = installed.extensionVersion || ideVersion
    try {
      var resp = ctx.host.http.request({
        method: "POST",
        url: CLOUD_URL + "/" + CLOUD_SERVICE + "/GetUserStatus",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        bodyText: JSON.stringify({
          metadata: {
            apiKey: apiKey,
            ideName: variant.ideName,
            ideVersion: ideVersion,
            extensionName: variant.ideName,
            extensionVersion: extensionVersion,
            locale: "en",
          },
        }),
        timeoutMs: 15000,
      })
      if (resp.status >= 200 && resp.status < 300) {
        return ctx.util.tryParseJson(resp.bodyText)
      }
    } catch (e) {
      ctx.host.log.warn("cloud request failed: " + String(e))
    }
    return null
  }

  function probeCloudVariant(ctx, variant) {
    var apiKey = loadApiKey(ctx, variant)
    if (!apiKey) return null

    var data = callCloud(ctx, apiKey, variant)
    if (!data || !data.userStatus) return null

    return buildPlanLines(ctx, data.userStatus)
  }

  // --- Probe ---

  function probe(ctx) {
    for (var i = 0; i < VARIANTS.length; i++) {
      var result = probeVariant(ctx, VARIANTS[i])
      if (result) return result
    }

    for (var j = 0; j < VARIANTS.length; j++) {
      var cloudResult = probeCloudVariant(ctx, VARIANTS[j])
      if (cloudResult) return cloudResult
    }

    throw "Start Windsurf or sign in and try again."
  }

  globalThis.__openusage_plugin = { id: "windsurf", probe: probe }
})()
