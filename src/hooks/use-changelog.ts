import { useEffect, useState } from "react"
import { PROJECT_RELEASE_TAG_API_URL_PREFIX } from "@/lib/project-metadata"

export interface Release {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  published_at: string | null
  html_url: string
}

async function fetchReleaseByTag(tag: string): Promise<Release | null> {
  const response = await fetch(`${PROJECT_RELEASE_TAG_API_URL_PREFIX}${encodeURIComponent(tag)}`)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error("Failed to fetch releases")
  }

  return (await response.json()) as Release
}

export function useChangelog(currentVersion: string) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadRelease = async () => {
      setLoading(true)
      setReleases([])
      setError(null)

      try {
        let release: Release | null

        if (currentVersion.startsWith("v")) {
          release =
            (await fetchReleaseByTag(currentVersion)) ??
            (await fetchReleaseByTag(currentVersion.slice(1)))
        } else {
          release =
            (await fetchReleaseByTag(`v${currentVersion}`)) ??
            (await fetchReleaseByTag(currentVersion))
        }

        if (!mounted) return
        setReleases(release ? [release] : [])
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "Failed to fetch releases")
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadRelease()

    return () => {
      mounted = false
    }
  }, [currentVersion])

  return { releases, loading, error }
}
