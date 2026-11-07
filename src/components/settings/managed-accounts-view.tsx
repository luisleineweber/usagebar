import { Button } from "@/components/ui/button"

export type ManagedAccountProfileView = {
  profileId: string
  label: string
  email?: string
  accountId?: string
  sourceKind: string
}

/** Local login that "Import current login" copies. Verified against each import command. */
const LOCAL_LOGIN_NAMES = {
  claude: "Claude Code login",
  codex: "Codex CLI login",
  gemini: "Gemini CLI login",
} satisfies Record<string, string>

export function managedAccountCopy(providerId: string, providerName: string) {
  const loginName =
    LOCAL_LOGIN_NAMES[providerId as keyof typeof LOCAL_LOGIN_NAMES] ?? `${providerName} login`
  return {
    title: `${providerName} Accounts`,
    description: `Import the current ${loginName} into an app-managed profile when you want UsageBar to stay pinned to one account.`,
    emptyText: `No imported ${providerName} accounts yet. UsageBar uses the detected local login until you import one.`,
  }
}

/**
 * Shared list for app-managed account profiles. The parent section owns the divider and spacing.
 */
export function ManagedAccountsView({
  providerId,
  providerName,
  profiles,
  selectedProfileId,
  loading,
  message,
  error,
  onImport,
  onSelect,
  onDelete,
}: {
  providerId: string
  providerName: string
  profiles: ManagedAccountProfileView[]
  selectedProfileId: string | null
  loading: boolean
  message: string | null
  error: string | null
  onImport: () => void
  onSelect: (profileId: string) => void
  onDelete: (profileId: string) => void
}) {
  const copy = managedAccountCopy(providerId, providerName)
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {copy.title}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button type="button" size="sm" onClick={onImport} disabled={loading}>
          Import current login
        </Button>
      </div>

      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{copy.emptyText}</p>
      ) : (
        <ul className="mt-3">
          {profiles.map((profile) => {
            const selected = profile.profileId === selectedProfileId
            return (
              <li
                key={profile.profileId}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-border/55 py-2.5 last:pb-0"
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => onSelect(profile.profileId)}
                >
                  <div className="truncate text-sm font-medium text-foreground">
                    {profile.label}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {profile.email ?? profile.accountId ?? profile.sourceKind}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  {selected && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Active
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(profile.profileId)}
                    disabled={loading}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {message && (
        <p role="status" className="mt-3 text-xs text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
