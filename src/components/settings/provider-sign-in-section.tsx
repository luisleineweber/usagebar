import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ProviderSignInOptions,
  hasSignInOptions,
} from "@/components/settings/provider-sign-in-options"
import { SettingsFeedbackLine } from "@/components/settings/settings-feedback-line"
import { SetupAssistant } from "@/components/settings/setup-assistant"
import type { ProviderSettingsActions } from "@/components/settings/use-provider-settings-actions"
import type { SetupDetection } from "@/lib/plugin-types"
import type { ProviderConfig, ProviderSettingsDefinition } from "@/lib/provider-settings"
import type { ProviderSignIn } from "@/lib/provider-sign-in-state"
import { cn } from "@/lib/utils"

const GROUP_TITLE_CLASS = "text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/**
 * Sign-in for one provider. Signed out: the ways to sign in are the focus of the page.
 * Signed in: one summary line, and the same options stay available behind "Change sign-in".
 * Unconfirmed (usage data, but no sign-in evidence): the same layout, with a "Sign in" button.
 */
export function ProviderSignInSection({
  className,
  providerId,
  providerName,
  signIn,
  hint,
  definition,
  config,
  detections,
  loading,
  actions,
  onSignedIn,
}: {
  className: string
  providerId: string
  providerName: string
  signIn: ProviderSignIn
  /** Provider guidance: how to sign in on this device. */
  hint: string
  definition: ProviderSettingsDefinition
  config?: ProviderConfig
  detections?: SetupDetection[]
  loading: boolean
  actions: ProviderSettingsActions
  onSignedIn?: () => void
}) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const headingId = `${providerId}-sign-in-heading`
  const optionsId = `${providerId}-sign-in-options`
  const hasChecks = Boolean(definition.setupChecks?.length)
  const hasOptions = hasSignInOptions(definition)

  const details = (
    <div className="space-y-4">
      {hasChecks ? (
        <SetupAssistant
          checks={definition.setupChecks ?? []}
          detections={detections}
          loading={loading}
        />
      ) : null}
      {hasOptions ? (
        <ProviderSignInOptions
          providerId={providerId}
          definition={definition}
          config={config}
          actions={actions}
          onSignedIn={onSignedIn}
        />
      ) : null}
    </div>
  )

  if (signIn.kind === "signedOut") {
    return (
      <section className={className} aria-labelledby={headingId}>
        <h4 id={headingId} className={GROUP_TITLE_CLASS}>
          Sign in
        </h4>
        <p className="mt-2 text-muted-foreground">
          {signIn.credentialProblem
            ? `The ${providerName} sign-in no longer works. Sign in again. ${hint}`
            : hint}
        </p>
        {hasChecks || hasOptions ? <div className="mt-4">{details}</div> : null}
        <SettingsFeedbackLine message={actions.message} error={actions.error} />
      </section>
    )
  }

  const signedIn = signIn.kind === "signedIn"
  const summary = signedIn
    ? `Signed in with ${formatList(signIn.sources)}.`
    : `UsageBar found no ${providerName} sign-in on this device. The last check still returned usage data.`

  return (
    <section className={className} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={headingId} className={GROUP_TITLE_CLASS}>
            {signedIn ? "Signed in" : "Sign-in"}
          </h4>
          <p className="mt-1 text-muted-foreground">{summary}</p>
        </div>
        {hasChecks || hasOptions ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={optionsOpen}
            aria-controls={optionsId}
            onClick={() => setOptionsOpen((open) => !open)}
          >
            {signedIn ? "Change sign-in" : "Sign in"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform", optionsOpen && "rotate-180")}
            />
          </Button>
        ) : null}
      </div>
      {optionsOpen ? (
        <div id={optionsId} className="mt-4 space-y-4">
          <p className="text-muted-foreground">{hint}</p>
          {details}
        </div>
      ) : null}
      <SettingsFeedbackLine message={actions.message} error={actions.error} />
    </section>
  )
}
