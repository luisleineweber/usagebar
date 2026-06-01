import { invoke } from "@tauri-apps/api/core"

export type GuidedCookieLoginRequest = {
  providerId: string
  windowTitle: string
  loginUrl: string
  successUrlContains: string
  cookieUrls: string[]
}

export type GuidedCookieLoginResponse = {
  cookieHeader: string
  finalUrl: string
  cookieCount: number
}

export async function captureProviderCookieHeader(
  request: GuidedCookieLoginRequest
): Promise<GuidedCookieLoginResponse> {
  return invoke<GuidedCookieLoginResponse>("capture_provider_cookie_header", request)
}
