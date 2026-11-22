/** True in the Windows app. WebView2 reports Windows in its user agent. */
export function isWindowsPlatform(): boolean {
  return navigator.userAgent.toLowerCase().includes("windows")
}
