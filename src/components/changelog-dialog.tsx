import { useEffect } from "react"
import { ChevronRight, ExternalLink as ExternalLinkIcon, Loader2 } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "@/components/ui/button"
import { useChangelog } from "@/hooks/use-changelog"
import {
  PROJECT_COMMIT_URL_PREFIX,
  PROJECT_PULL_URL_PREFIX,
  PROJECT_RELEASES_URL,
} from "@/lib/project-metadata"

interface ChangelogDialogProps {
  currentVersion: string
  onBack: () => void
  onClose: () => void
}

function SimpleMarkdown({ content }: { content: string }) {
  const patterns = [
    { type: "link", regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g },
    { type: "url", regex: /(https?:\/\/[^\s<>]*[^\s<>.,:;!'")\]])/g },
    { type: "bold", regex: /(\*\*|__)(.*?)\1/g },
    { type: "italic", regex: /(\*|_)(.*?)\1/g },
    { type: "pr", regex: /(#\d+)/g },
    { type: "user", regex: /(@[\w-]+)/g },
    { type: "commit", regex: /\b([a-f0-9]{7})\b/g },
  ]

  const linkClass = "cursor-pointer text-[#58a6ff] transition-colors hover:text-[#58a6ff]/80 hover:underline"

  const renderText = (text: string): React.ReactNode => {
    let parts: Array<{ type: string; content: string; url?: string }> = [{ type: "text", content: text }]

    patterns.forEach((pattern) => {
      const nextParts: typeof parts = []

      parts.forEach((part) => {
        if (part.type !== "text") {
          nextParts.push(part)
          return
        }

        let lastIndex = 0
        const regex = new RegExp(pattern.regex)
        let match: RegExpExecArray | null

        while ((match = regex.exec(part.content)) !== null) {
          if (match.index > lastIndex) {
            nextParts.push({ type: "text", content: part.content.slice(lastIndex, match.index) })
          }

          if (pattern.type === "link") {
            nextParts.push({ type: "link", content: match[1], url: match[2] })
          } else if (pattern.type === "url") {
            nextParts.push({ type: "link", content: match[1], url: match[1] })
          } else if (pattern.type === "bold") {
            nextParts.push({ type: "bold", content: match[2] })
          } else if (pattern.type === "italic") {
            nextParts.push({ type: "italic", content: match[2] })
          } else if (pattern.type === "pr") {
            nextParts.push({ type: "pr", content: match[1] })
          } else if (pattern.type === "user") {
            nextParts.push({ type: "user", content: match[1] })
          } else if (pattern.type === "commit") {
            nextParts.push({ type: "commit", content: match[1] })
          }

          lastIndex = regex.lastIndex
        }

        if (lastIndex < part.content.length) {
          nextParts.push({ type: "text", content: part.content.slice(lastIndex) })
        }
      })

      parts = nextParts
    })

    return parts.map((part, index) => {
      if (part.type === "link") {
        return (
          <button
            key={index}
            type="button"
            className={linkClass}
            onClick={() => openUrl(part.url!).catch(console.error)}
          >
            {part.content}
          </button>
        )
      }

      if (part.type === "bold") {
        return (
          <strong key={index} className="font-bold text-foreground">
            {renderText(part.content)}
          </strong>
        )
      }

      if (part.type === "italic") {
        return (
          <em key={index} className="italic text-foreground/90">
            {renderText(part.content)}
          </em>
        )
      }

      if (part.type === "pr") {
        return (
          <button
            key={index}
            type="button"
            className={linkClass}
            onClick={() => openUrl(`${PROJECT_PULL_URL_PREFIX}${part.content.slice(1)}`).catch(console.error)}
          >
            {part.content}
          </button>
        )
      }

      if (part.type === "user") {
        return (
          <button
            key={index}
            type="button"
            className={linkClass}
            onClick={() => openUrl(`https://github.com/${part.content.slice(1)}`).catch(console.error)}
          >
            {part.content}
          </button>
        )
      }

      if (part.type === "commit") {
        return (
          <button
            key={index}
            type="button"
            className={`${linkClass} font-mono`}
            onClick={() => openUrl(`${PROJECT_COMMIT_URL_PREFIX}${part.content}`).catch(console.error)}
          >
            {part.content}
          </button>
        )
      }

      return <span key={index}>{part.content}</span>
    })
  }

  return (
    <div className="space-y-1.5 break-words">
      {content.split("\n").map((line, index) => {
        const trimmed = line.trim()

        if (trimmed === "---" || trimmed === "***" || trimmed === "--") {
          return <hr key={index} className="my-4 border-t border-border/50" />
        }

        if (trimmed.startsWith("###")) {
          return (
            <h4 key={index} className="mb-1 mt-4 text-sm font-bold text-foreground">
              {renderText(trimmed.replace(/^###\s*/, ""))}
            </h4>
          )
        }

        if (trimmed.startsWith("##")) {
          return (
            <h3 key={index} className="mb-2 mt-5 text-base font-bold text-foreground">
              {renderText(trimmed.replace(/^##\s*/, ""))}
            </h3>
          )
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={index} className="flex gap-2 pl-1 text-[13px] leading-relaxed">
              <span className="mt-1.5 shrink-0 scale-75 text-muted-foreground/60">o</span>
              <span className="flex-1 text-foreground/90">{renderText(trimmed.replace(/^[-*]\s*/, ""))}</span>
            </div>
          )
        }

        if (!trimmed) return <div key={index} className="h-1" />

        return (
          <p key={index} className="text-[13px] leading-relaxed text-foreground/90">
            {renderText(line)}
          </p>
        )
      })}
    </div>
  )
}

export function ChangelogDialog({ currentVersion, onBack, onClose }: ChangelogDialogProps) {
  const { releases, loading, error } = useChangelog(currentVersion)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const currentRelease = releases.find((release) =>
    release.tag_name === currentVersion
    || release.tag_name === `v${currentVersion}`
    || release.name === currentVersion
    || release.name === `v${currentVersion}`
  )

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-[2px]">
      <div className="flex h-[88%] w-[92%] flex-col rounded-lg border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b bg-muted/20 p-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Back"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onBack}
            >
              <ChevronRight className="size-5 rotate-180" />
            </button>
            <h2 className="text-sm font-semibold tracking-tight">Release Notes</h2>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">Fetching release info...</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <span className="mb-1 text-sm font-medium text-destructive">Failed to load release notes</span>
              <span className="mb-4 text-xs text-muted-foreground">{error}</span>
              <Button size="xs" variant="outline" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </div>
          ) : currentRelease ? (
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
              <div className="mb-4 flex items-baseline justify-between border-b pb-4">
                <div>
                  <h3 className="text-lg font-bold">{currentRelease.name || currentRelease.tag_name}</h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {currentRelease.published_at
                      ? (() => {
                          const date = new Date(currentRelease.published_at)
                          const year = date.getUTCFullYear()
                          const month = String(date.getUTCMonth() + 1).padStart(2, "0")
                          const day = String(date.getUTCDate()).padStart(2, "0")
                          return `Released on ${year}/${month}/${day}`
                        })()
                      : "Unpublished release"}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-[#58a6ff] hover:underline"
                  onClick={() => openUrl(currentRelease.html_url).catch(console.error)}
                >
                  GitHub <ExternalLinkIcon className="size-3" />
                </button>
              </div>

              <div className="rounded-lg bg-muted/10 p-1">
                <SimpleMarkdown content={currentRelease.body ?? ""} />
              </div>

              {releases.length >= 1 && (
                <div className="mt-8 border-t border-dashed pt-6">
                  <p className="text-center text-[10px] text-muted-foreground">
                    Looking for older versions? Check the{" "}
                    <button
                      type="button"
                      className="text-[#58a6ff] hover:underline"
                      onClick={() => openUrl(PROJECT_RELEASES_URL).catch(console.error)}
                    >
                      full changelog
                    </button>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center opacity-60">
              <span className="mb-1 text-sm font-medium">No specific notes for v{currentVersion}</span>
              <span className="mb-4 text-xs">This version might be a pre-release or local build.</span>
              <button
                type="button"
                className="text-xs text-[#58a6ff] hover:underline"
                onClick={() => openUrl(PROJECT_RELEASES_URL).catch(console.error)}
              >
                View all releases on GitHub
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
