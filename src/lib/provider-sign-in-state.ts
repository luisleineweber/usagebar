import type { ProbeErrorCategory, SetupDetection } from "@/lib/plugin-types"
import type { ProviderConnectionState } from "@/lib/provider-connection-state"
import type { ProviderSetupCheck } from "@/lib/provider-settings"

/**
 * Sign-in is separate from the connection state. A provider can be signed in and still show
 * Error, for example after a rate limit (HTTP 429). The Settings detail page uses this value
 * to choose between the sign-in view and the manage view.
 *
 * - signedIn: a settled probe succeeded, a local sign-in was found, or the app stores a credential.
 * - signedOut: the last settled probe rejected the credential, or no sign-in evidence exists.
 */
export type ProviderSignIn =
  | { kind: "signedIn"; sources: string[] }
  | { kind: "signedOut"; credentialProblem: boolean }

const CREDENTIAL_ERROR_CATEGORIES = new Set<ProbeErrorCategory>([
  "credentialMissing",
  "credentialUnavailable",
  "credentialUnreadable",
  "credentialInvalid",
  "credentialExpired",
])

export function getProviderSignIn({
  connectionState,
  errorCategory,
  setupChecks,
  detections,
  storedCredentialLabels,
}: {
  connectionState: ProviderConnectionState
  /** Category of the last settled probe error; null or undefined when it did not fail. */
  errorCategory: ProbeErrorCategory | null | undefined
  setupChecks: ProviderSetupCheck[] | undefined
  detections: SetupDetection[] | undefined
  /** Labels of credentials the app has stored for this provider. */
  storedCredentialLabels: string[]
}): ProviderSignIn {
  if (
    connectionState === "error" &&
    errorCategory &&
    CREDENTIAL_ERROR_CATEGORIES.has(errorCategory)
  ) {
    return { kind: "signedOut", credentialProblem: true }
  }

  const foundChecks = (setupChecks ?? [])
    .filter((check) => detections?.some((d) => d.id === check.id && d.state === "found"))
    .map((check) => check.label)
  const sources = [...new Set([...foundChecks, ...storedCredentialLabels])]

  if (sources.length > 0) return { kind: "signedIn", sources }
  if (connectionState === "connected") return { kind: "signedIn", sources: [] }
  return { kind: "signedOut", credentialProblem: false }
}
