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
import { getProviderIconColor } from "@/lib/provider-icon"
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
      "Öffne ein Terminal und führe codex login aus.",
      "Melde dich mit dem ChatGPT-Konto an, dessen Limits du sehen möchtest.",
      "UsageBar liest die lokale Codex-Anmeldung und prüft die Verbindung.",
    ],
    credentialHelp:
      "Führe codex login aus und versuche es erneut. Ein ChatGPT-Cookie ist nur für zusätzliche Dashboard-Historie nötig, nicht für die grundlegenden Limits.",
  },
  claude: {
    recommended: true,
    steps: [
      "Starte Claude Code im Terminal mit claude.",
      "Folge beim ersten Start der Anmeldung im Browser. Nutze in Claude Code bei Bedarf /login.",
      "Falls lokale Zugangsdaten nicht lesbar sind, kannst du später einen claude.ai-Cookie importieren.",
    ],
    credentialHelp:
      "Starte Claude Code mit claude und nutze dort /login. Wenn die lokale Anmeldung nicht gelesen werden kann, öffne später die Provider-Einstellungen und importiere den claude.ai-Cookie aus Edge oder trage den Cookie-Header manuell ein.",
  },
  cursor: {
    recommended: true,
    steps: [
      "Öffne Cursor und melde dich mit deinem Konto an.",
      "Lass Cursor einmal vollständig starten, damit die lokale Sitzung gespeichert ist.",
      "UsageBar erkennt die Desktop- oder CLI-Anmeldung automatisch.",
    ],
    credentialHelp:
      "Melde dich in Cursor Desktop oder über die Cursor CLI an, starte Cursor einmal neu und versuche es erneut.",
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
      `Aktiviere ${provider.name} und starte die Verbindungsprüfung.`,
      "Weitere Zugangsdaten kannst du später in den Provider-Einstellungen ergänzen.",
    ],
    credentialHelp:
      definition.connectHint ??
      "Öffne die Provider-Einstellungen, ergänze die benötigten Zugangsdaten und versuche es erneut.",
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
      "Öffne die Provider-Einstellungen, ergänze die benötigten Zugangsdaten und versuche es erneut."
    )
  }
  if (category === "credentialExpired" || category === "credentialInvalid") {
    return "Die gespeicherte Anmeldung ist abgelaufen oder ungültig. Melde dich beim Provider erneut an und wiederhole die Prüfung."
  }
  if (category === "providerResponse") {
    return "Der Provider hat die Anfrage abgelehnt oder unerwartet beantwortet. Prüfe die Internetverbindung und den Provider-Status, dann versuche es erneut."
  }
  return "Die Aktualisierung ist fehlgeschlagen. Deine Auswahl bleibt gespeichert; du kannst die Verbindung jetzt erneut prüfen oder später in den Provider-Einstellungen fortfahren."
}

function ProviderIcon({ provider, isDark }: { provider: SettingsPluginState; isDark: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block size-7 shrink-0 bg-foreground/80"
      style={{
        backgroundColor: getProviderIconColor(provider.brandColor, isDark),
        WebkitMaskImage: `url(${provider.iconUrl})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${provider.iconUrl})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  )
}

function StatusLabel({ status }: { status: SetupStatus }) {
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
        Verbindung wird geprüft
      </span>
    )
  }
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-green-700 dark:text-green-500">
        <CheckCircle2 className="size-3.5" />
        Verbunden
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <AlertCircle className="size-3.5" />
        Aktualisierung fehlgeschlagen
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Circle className="size-3.5" />
      Noch nicht eingerichtet
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
      setSubmitError("Die Auswahl konnte nicht gespeichert werden. Bitte versuche es erneut.")
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
      setSubmitError("Der Provider konnte nicht entfernt werden. Bitte versuche es erneut.")
    }
  }

  const finishOnboarding = async () => {
    setFinishError(null)
    try {
      await onFinish()
    } catch (error) {
      console.error("Failed to finish onboarding:", error)
      setFinishError("Der Abschluss konnte nicht gespeichert werden. Bitte versuche es erneut.")
    }
  }

  return (
    <main className="mx-auto flex min-h-[624px] w-full max-w-3xl flex-col" aria-live="polite">
      <header className="border-b border-border pb-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className={step === "select" ? "text-foreground" : undefined}>Provider wählen</span>
          <ChevronRight className="size-3.5" />
          <span className={step === "connect" ? "text-foreground" : undefined}>
            Verbindung prüfen
          </span>
          <ChevronRight className="size-3.5" />
          <span className={step === "success" ? "text-foreground" : undefined}>Fertig</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {step === "select"
            ? "Was möchtest du verbinden?"
            : step === "connect"
              ? "Verbindungen prüfen"
              : "UsageBar ist bereit"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">
          {step === "select"
            ? "Wähle die Provider, die direkt in deiner Bar erscheinen sollen. Die empfohlenen lokalen Integrationen sind bereits ausgewählt."
            : step === "connect"
              ? "UsageBar prüft deine vorhandenen lokalen Anmeldungen. Fehlende Zugangsdaten kannst du direkt beim jeweiligen Provider nachholen."
              : "Deine ausgewählten Provider erscheinen jetzt in der Bar. UsageBar aktualisiert ihre Daten automatisch."}
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
                  <label
                    key={provider.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-4 py-4 transition-colors hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleProvider(provider.id)}
                      aria-label={`${provider.name} auswählen`}
                      className="mt-1"
                    />
                    <ProviderIcon provider={provider} isDark={isDark} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{provider.name}</span>
                        {guidance.recommended ? (
                          <Badge variant="outline" className="text-[0.68rem]">
                            Empfohlen
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                  </label>
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
              Die Auswahl kann später unter Einstellungen geändert werden.
            </p>
            <Button
              onClick={() => void connectProviders()}
              disabled={selectedProviders.length === 0}
            >
              Verbindungen prüfen
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
                    <ProviderIcon provider={provider} isDark={isDark} />
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
                        Erneut prüfen
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
              Auswahl ändern
            </Button>
            <Button
              onClick={() => setStep("success")}
              disabled={isChecking || selectedProviders.length === 0}
            >
              Einrichtung abschließen
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
          <p className="text-xl font-semibold">Auswahl gespeichert</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {connectedCount} von {selectedProviders.length} Providern sind verbunden. Provider mit
            fehlgeschlagener Aktualisierung bleiben in der Bar sichtbar und können später erneut
            geprüft werden.
          </p>
          {finishError ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {finishError}
            </p>
          ) : null}
          <Button className="mt-6" onClick={() => void finishOnboarding()}>
            UsageBar öffnen
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </main>
  )
}
