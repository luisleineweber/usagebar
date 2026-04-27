import { beforeEach, describe, expect, it, vi } from "vitest"
import { makePluginTestContext } from "../test-helpers.js"

const ADC_PATH = "~/AppData/Roaming/gcloud/application_default_credentials.json"
const CONFIG_PATH = "~/AppData/Roaming/gcloud/configurations/config_default"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function idToken(ctx, payload) {
  return "h." + ctx.base64.encode(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + ".s"
}

function writeAdc(ctx, overrides = {}) {
  ctx.host.fs.writeText(ADC_PATH, JSON.stringify({
    client_id: "client-id",
    client_secret: "client-secret",
    refresh_token: "refresh-token",
    access_token: "access-token",
    token_expiry: "2026-02-02T01:00:00.000Z",
    id_token: idToken(ctx, { email: "user@example.com" }),
    ...overrides,
  }))
}

function writeProject(ctx, project = "usagebar-test") {
  ctx.host.fs.writeText(CONFIG_PATH, "[core]\nproject = " + project + "\n")
}

function series(key, value, type = "doubleValue") {
  const [quotaMetric, limitName, location] = key.split("|")
  return {
    metric: {
      labels: {
        quota_metric: quotaMetric,
        limit_name: limitName,
      },
    },
    resource: {
      labels: {
        location,
      },
    },
    points: [{ value: { [type]: value } }],
  }
}

describe("vertex-ai plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when ADC credentials are missing", async () => {
    const ctx = makePluginTestContext()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Vertex AI gcloud ADC credentials missing. Run `gcloud auth application-default login`."
    )
  })

  it("refreshes expired ADC credentials and maps Cloud Monitoring quota", async () => {
    const ctx = makePluginTestContext()
    writeAdc(ctx, { access_token: "", token_expiry: "2026-02-01T00:00:00.000Z" })
    writeProject(ctx)
    ctx.host.http.request.mockImplementation((request) => {
      if (request.url === "https://oauth2.googleapis.com/token") {
        expect(request.bodyText).toContain("refresh_token=refresh-token")
        return {
          status: 200,
          bodyText: JSON.stringify({
            access_token: "fresh-token",
            expires_in: 3600,
            id_token: idToken(ctx, { email: "fresh@example.com" }),
          }),
        }
      }
      if (request.url.includes("allocation%2Fusage")) {
        return { status: 200, bodyText: JSON.stringify({ timeSeries: [series("aiplatform.googleapis.com%2Fonline_prediction_requests_per_base_model|default|global", 40)] }) }
      }
      if (request.url.includes("quota%2Flimit")) {
        return { status: 200, bodyText: JSON.stringify({ timeSeries: [series("aiplatform.googleapis.com%2Fonline_prediction_requests_per_base_model|default|global", "100", "int64Value")] }) }
      }
      return { status: 404, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("usagebar-test")
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "badge",
      label: "Source",
      text: "gcloud ADC",
      subtitle: "usagebar-test",
    })
    expect(result.lines.find((line) => line.label === "Quota usage")).toEqual({
      type: "progress",
      label: "Quota usage",
      used: 40,
      limit: 100,
      format: { kind: "percent" },
    })
    expect(result.lines.find((line) => line.label === "Account")?.value).toBe("fresh@example.com")
    expect(ctx.host.http.request.mock.calls[1][0].headers.Authorization).toBe("Bearer fresh-token")
  })

  it("uses GOOGLE_CLOUD_PROJECT when no config file exists", async () => {
    const ctx = makePluginTestContext()
    writeAdc(ctx)
    ctx.host.env.get.mockImplementation((name) => (name === "GOOGLE_CLOUD_PROJECT" ? "env-project" : null))
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: JSON.stringify({ timeSeries: [] }) })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("env-project")
    expect(result.lines.find((line) => line.label === "Quota")?.value).toBe("No recent quota data")
  })

  it("throws when project id is missing", async () => {
    const ctx = makePluginTestContext()
    writeAdc(ctx)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Vertex AI project missing. Run `gcloud config set project PROJECT_ID` or set GOOGLE_CLOUD_PROJECT."
    )
  })

  it("throws for unsupported service account ADC", async () => {
    const ctx = makePluginTestContext()
    writeAdc(ctx, { type: "service_account", private_key: "secret" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Vertex AI service-account ADC is not supported yet. Use `gcloud auth application-default login`."
    )
  })

  it("surfaces Cloud Monitoring authorization failures", async () => {
    const ctx = makePluginTestContext()
    writeAdc(ctx)
    writeProject(ctx)
    ctx.host.http.request.mockReturnValue({ status: 403, bodyText: "{}" })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "Vertex AI access forbidden. Check Cloud Monitoring IAM permissions for the project."
    )
  })
})
