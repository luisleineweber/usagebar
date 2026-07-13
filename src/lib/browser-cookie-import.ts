import { invoke } from "@tauri-apps/api/core"

export type BrowserImportSource = {
  sourceId: string
  displayName: string
  profiles: string[]
}

export type BrowserCookieImportCode =
  | "ok"
  | "notEnabled"
  | "unsupportedProvider"
  | "notInstalled"
  | "invalidProfile"
  | "noMatch"
  | "browserLocked"
  | "unsupportedEncryption"
  | "vaultWriteFailed"

export type BrowserCookieImportResult = {
  providerId: string
  sourceId: string
  profileId: string
  code: BrowserCookieImportCode
  matchedCount: number
  skippedExpiredCount: number
  decryptFailureCount: number
}

export function listBrowserImportSources(providerId: string): Promise<BrowserImportSource[]> {
  return invoke("list_browser_import_sources", { providerId })
}

export function importBrowserCookies(
  providerId: string,
  sourceId: string,
  profileId: string
): Promise<BrowserCookieImportResult> {
  return invoke("import_browser_cookies", { providerId, sourceId, profileId })
}

export function browserImportMessage(result: BrowserCookieImportResult): string {
  switch (result.code) {
    case "ok":
      return `Imported ${result.matchedCount} approved session cookie${result.matchedCount === 1 ? "" : "s"}.`
    case "notEnabled":
      return "Enable browser import for this provider first."
    case "notInstalled":
      return "Microsoft Edge or the selected profile was not found."
    case "noMatch":
      return "No approved signed-in session was found. Sign in with Edge, then retry or paste the Cookie header manually."
    case "browserLocked":
      return "Edge is using the cookie database. Close Edge briefly, then retry."
    case "unsupportedEncryption":
      return "Windows could not decrypt this Edge session. Use guided login or paste the Cookie header manually."
    case "vaultWriteFailed":
      return "The session was found, but the Windows credential store could not save it."
    case "invalidProfile":
      return "The selected Edge profile is no longer available."
    default:
      return "Browser import is not available for this provider."
  }
}
