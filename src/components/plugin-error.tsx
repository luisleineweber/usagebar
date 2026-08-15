import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ProbeErrorCategory } from "@/lib/plugin-types"

type PluginErrorProps = {
  message: string
  category?: ProbeErrorCategory | null
}

const CREDENTIAL_ERROR_LABELS = {
  credentialMissing: "Credentials missing",
  credentialUnavailable: "Credentials unavailable",
  credentialUnreadable: "Credentials unreadable",
  credentialInvalid: "Credentials invalid",
  credentialExpired: "Credentials expired",
} satisfies Partial<Record<ProbeErrorCategory, string>>

function formatMessage(message: string) {
  const parts = message.split(/`([^`]+)`/)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={`code-${index}`}
        className="rounded bg-muted px-1 font-mono text-[0.75rem] leading-tight"
      >
        {part}
      </code>
    ) : (
      part
    )
  )
}

export function PluginError({ message, category }: PluginErrorProps) {
  const categoryLabel = category
    ? CREDENTIAL_ERROR_LABELS[category as keyof typeof CREDENTIAL_ERROR_LABELS]
    : null
  return (
    <Alert
      variant="destructive"
      className="flex items-center gap-2 [&>svg]:static [&>svg]:translate-y-0 [&>svg~*]:pl-0 [&>svg+div]:translate-y-0"
    >
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="select-text cursor-text">
        {categoryLabel ? <div className="font-medium">{categoryLabel}</div> : null}
        <div>{formatMessage(message)}</div>
      </AlertDescription>
    </Alert>
  )
}
