import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { OnboardingCookieField } from "@/components/onboarding/onboarding-cookie-field"
import { ProviderRetryAction } from "@/components/onboarding/provider-retry-action"
import { useDarkMode } from "@/hooks/use-dark-mode"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import { ProviderIcon } from "@/components/provider-icon"
import type { ProbeErrorCategory } from "@/lib/plugin-types"
import { getProviderSettingsDefinition } from "@/lib/provider-settings"

type ProviderOnboardingGuidance = {
  recommended: boolean
  steps: string[]
  credentialHelp: string
}

const PROVIDER_GUIDANCE: Record<string, ProviderOnboardingGuidance> = {
  codex: {
    recommended: true,
    steps: [
      "Open a terminal and run `codex login`.",
      "Sign in with the ChatGPT account that you want to track.",
      "UsageBar reads the local Codex sign-in and checks the connection.",
    ],
    credentialHelp:
      "Run `codex login`, then try again. A ChatGPT Cookie header is only needed for extra dashboard history. It is not needed for basic limits.",
  },
  claude: {
    recommended: true,
    steps: [
      "Start Claude Code in a terminal with `claude`.",
      "Follow the browser sign-in steps on first start. If needed, run `/login` in Claude Code.",
      "If UsageBar cannot read the local credentials, you can import a claude.ai Cookie header later.",
    ],
    credentialHelp:
      "Start Claude Code and run `/login`. If UsageBar cannot read the local sign-in, open Provider Settings later and import the claude.ai Cookie header from Edge, or enter the header manually.",
  },
  cursor: {
    recommended: true,
    steps: [
      "Open Cursor and sign in.",
      "Leave Cursor open until it saves the local session.",
      "UsageBar detects the desktop or CLI sign-in.",
    ],
    credentialHelp: "Sign in to Cursor Desktop or the Cursor CLI. Restart Cursor, then try again.",
  },
}

function getProviderGuidance(provider: SettingsPluginState): ProviderOnboardingGuidance {
  const known = PROVIDER_GUIDANCE[provider.id]
  if (known) return known
  const definition = getProviderSettingsDefinition(provider.id)
  return {
    recommended: false,
    steps: [
      definition.connectHint ?? definition.statusHint,
      `Enable ${provider.name}, then start the connection check.`,
      "Add more credentials later in Provider Settings.",
    ],
    credentialHelp:
      definition.connectHint ??
      "Open Provider Settings, add the required credentials, then try again.",
  }
}

type SetupStatus = "idle" | "loading" | "connected" | "failed"

function getSetupStatus(provider: SettingsPluginState): SetupStatus {
  if (provider.state.loading) return "loading"
  if (provider.state.error) return "failed"
  if (provider.state.data) return "connected"
  return "idle"
}

function getFailureHelp(providerId: string, category?: ProbeErrorCategory | null): string {
  if (
    category === "credentialMissing" ||
    category === "credentialUnavailable" ||
    category === "credentialUnreadable"
  ) {
    return (
      PROVIDER_GUIDANCE[providerId]?.credentialHelp ??
      "Open Provider Settings, add the required credentials, then try again."
    )
  }
  if (category === "credentialExpired" || category === "credentialInvalid") {
    return "The saved sign-in has expired or is not valid. Sign in to the provider again, then check the connection."
  }
  if (category === "providerResponse") {
    return "The provider rejected the request or returned an unexpected response. Check your internet connection and the provider status, then try again."
  }
  return "The refresh failed. Your selection is saved. Check the connection again now or continue in Provider Settings later."
}

function OnboardingProviderIcon({
  provider,
  isDark,
}: {
  provider: SettingsPluginState
  isDark: boolean
}) {
  return (
    <ProviderIcon
      iconUrl={provider.iconUrl}
      darkIconUrl={provider.darkIconUrl}
      iconColorMode={provider.iconColorMode}
      iconAspectRatio={provider.iconAspectRatio}
      fit="natural"
      brandColor={provider.brandColor}
      isDark={isDark}
      className={provider.iconAspectRatio ? "h-4 w-4" : "size-7"}
      ariaHidden
    />
  )
}

function StatusLabel({ status }: { status: SetupStatus }) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
        Checking connection
      </span>
    )
  }
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-green-700 dark:text-green-500">
        <CheckCircle2 className="size-3.5" />
        Connected
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="size-3.5" />
        Refresh failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Circle className="size-3.5" />
      Not set up
    </span>
  )
}

type FirstRunOnboardingProps = {
  providers: SettingsPluginState[]
  onConnect: (providerIds: string[], providerIdsToCheck?: string[]) => Promise<void>
  onRetry: (providerId: string) => void
  onSecretSave?: (providerId: string, secretKey: string, value: string) => Promise<void>
  onFinish: () => Promise<void>
}

export function FirstRunOnboarding({
  providers,
  onConnect,
  onRetry,
  onSecretSave,
  onFinish,
}: FirstRunOnboardingProps) {
  const isDark = useDarkMode()
  const [step, setStep] = useState<"select" | "connect" | "success">("select")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const initializedSelectionRef = useRef(false)
  const successfulProviderIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (initializedSelectionRef.current || providers.length === 0) return
    initializedSelectionRef.current = true
    setSelectedIds(
      new Set(
        providers
          .filter((provider) => provider.supported && provider.enabled)
          .map((provider) => provider.id)
      )
    )
  }, [providers])

  useEffect(() => {
    for (const provider of providers) {
      if (provider.state.data && !provider.state.loading && !provider.state.error) {
        successfulProviderIdsRef.current.add(provider.id)
      } else if (provider.state.loading || provider.state.error) {
        successfulProviderIdsRef.current.delete(provider.id)
      }
    }
  }, [providers])

  const supportedProviders = providers
    .filter((provider) => provider.supported)
    .sort((a, b) => {
      const recommendedDifference =
        Number(getProviderGuidance(b).recommended) - Number(getProviderGuidance(a).recommended)
      if (recommendedDifference) return recommendedDifference
      if (getProviderGuidance(a).recommended) return 0
      return a.name.localeCompare(b.name)
    })
  const selectedProviders = supportedProviders.filter((provider) => selectedIds.has(provider.id))
  const connectedCount = selectedProviders.filter(
    (provider) => getSetupStatus(provider) === "connected"
  ).length
  const isChecking = selectedProviders.some((provider) => getSetupStatus(provider) === "loading")

  const toggleProvider = (providerId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(providerId)) next.delete(providerId)
      else next.add(providerId)
      return next
    })
  }

  const connectProviders = async () => {
    setSubmitError(null)
    try {
      const selectedProviderIds = selectedProviders.map((provider) => provider.id)
      const providerIdsToCheck = selectedProviderIds.filter(
        (providerId) => !successfulProviderIdsRef.current.has(providerId)
      )
      await onConnect(selectedProviderIds, providerIdsToCheck)
      setStep("connect")
    } catch (error) {
      console.error("Failed to save onboarding provider selection:", error)
      setSubmitError("Unable to save the selection. Try again.")
    }
  }

  const removeProvider = async (providerId: string) => {
    setSubmitError(null)
    const nextSelectedIds = new Set(selectedIds)
    nextSelectedIds.delete(providerId)
    const nextSelectedProviderIds = supportedProviders
      .filter((provider) => nextSelectedIds.has(provider.id))
      .map((provider) => provider.id)

    try {
      await onConnect(nextSelectedProviderIds, [])
      setSelectedIds(nextSelectedIds)
    } catch (error) {
      console.error("Failed to remove onboarding provider:", error)
      setSubmitError("Unable to remove the provider. Try again.")
    }
  }

  const finishOnboarding = async () => {
    setFinishError(null)
    try {
      await onFinish()
    } catch (error) {
      console.error("Failed to finish onboarding:", error)
      setFinishError("Unable to save the setup. Try again.")
    }
  }

  return (
    <main className="mx-auto flex min-h-[624px] w-full max-w-3xl flex-col" aria-live="polite">
      <header className="border-b border-border pb-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={step === "select" ? "text-foreground" : undefined}>
            Choose providers
          </span>
          <ChevronRight className="size-3.5" />
          <span className={step === "connect" ? "text-foreground" : undefined}>
            Check connections
          </span>
          <ChevronRight className="size-3.5" />
          <span className={step === "success" ? "text-foreground" : undefined}>Done</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {step === "select"
            ? "What do you want to connect?"
            : step === "connect"
              ? "Check connections"
              : "UsageBar is ready"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
          {step === "select"
            ? "Choose the providers to show in your bar. Recommended local integrations are already selected."
            : step === "connect"
              ? "UsageBar checks your existing local sign-ins. You can add missing credentials on each provider card."
              : "Your selected providers now appear in the bar. UsageBar updates their data automatically."}
        </p>
      </header>

      {step === "select" ? (
        <>
          <div className="flex-1 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {supportedProviders.map((provider) => {
                const checked = selectedIds.has(provider.id)
                const guidance = getProviderGuidance(provider)
                return (
                  <div
                    key={provider.id}
                    className="flex items-start gap-3 rounded-lg border border-border px-4 py-4 transition-colors hover:bg-muted/60"
                  >
                    <Checkbox
                      id={`onboarding-provider-${provider.id}`}
                      checked={checked}
                      onCheckedChange={() => toggleProvider(provider.id)}
                      aria-label={`Select ${provider.name}`}
                      className="mt-1"
                    />
                    <label
                      htmlFor={`onboarding-provider-${provider.id}`}
                      className="flex min-w-0 flex-1 cursor-pointer items-start gap-3"
                    >
                      <OnboardingProviderIcon provider={provider} isDark={isDark} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{provider.name}</span>
                          {guidance.recommended ? (
                            <Badge variant="outline" className="text-[0.68rem]">
                              Recommended
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
            {submitError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {submitError}
              </p>
            ) : null}
          </div>
          <footer className="flex items-center justify-between border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              You can change your selection later in Settings.
            </p>
            <Button
              onClick={() => void connectProviders()}
              disabled={selectedProviders.length === 0}
            >
              Check connections
              <ChevronRight />
            </Button>
          </footer>
        </>
      ) : null}

      {step === "connect" ? (
        <>
          <div className="flex-1 space-y-3 py-5">
            {selectedProviders.map((provider) => {
              const status = getSetupStatus(provider)
              return (
                <section key={provider.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <OnboardingProviderIcon provider={provider} isDark={isDark} />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium">{provider.name}</h2>
                      <div className="mt-0.5 text-xs font-medium">
                        <StatusLabel status={status} />
                      </div>
                    </div>
                    {status === "failed" ? (
                      <ProviderRetryAction
                        providerName={provider.name}
                        onRetry={() => onRetry(provider.id)}
                        onRemove={() => void removeProvider(provider.id)}
                      />
                    ) : status === "idle" ? (
                      <Button variant="outline" size="sm" onClick={() => onRetry(provider.id)}>
                        <RefreshCw />
                        Check again
                      </Button>
                    ) : null}
                  </div>
                  {status === "failed" ? (
                    <div className="mt-3 rounded-md bg-destructive/8 px-3 py-2.5 text-sm leading-5">
                      <p className="font-medium">{provider.state.error}</p>
                      <p className="mt-1 text-muted-foreground">
                        {getFailureHelp(provider.id, provider.state.errorCategory)}
                      </p>
                    </div>
                  ) : status === "idle" ? (
                    <ol className="mt-3 space-y-1.5 text-sm leading-5 text-muted-foreground">
                      {getProviderGuidance(provider).steps.map((instruction, index) => (
                        <li key={instruction} className="flex gap-2">
                          <span className="font-medium text-foreground">{index + 1}.</span>
                          <span>{instruction}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {status === "failed" && onSecretSave ? (
                    <OnboardingCookieField
                      providerId={provider.id}
                      providerName={provider.name}
                      definition={getProviderSettingsDefinition(provider.id)}
                      onSecretSave={onSecretSave}
                      onRetry={() => onRetry(provider.id)}
                    />
                  ) : null}
                </section>
              )
            })}
          </div>
          <footer className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setStep("select")} disabled={isChecking}>
              Change selection
            </Button>
            <Button
              onClick={() => setStep("success")}
              disabled={isChecking || selectedProviders.length === 0}
            >
              Complete setup
              <Check />
            </Button>
          </footer>
        </>
      ) : null}

      {step === "success" ? (
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <span className="mb-5 grid size-14 place-items-center rounded-full bg-green-500/15 text-green-700 dark:text-green-500">
            <Check className="size-7" />
          </span>
          <p className="text-xl font-semibold">Selection saved</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {connectedCount} of {selectedProviders.length} providers are connected. Providers with
            failed refresh remain visible in the bar. You can check them again later.
          </p>
          {finishError ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {finishError}
            </p>
          ) : null}
          <Button className="mt-6" onClick={() => void finishOnboarding()}>
            Open UsageBar
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </main>
  )
}
