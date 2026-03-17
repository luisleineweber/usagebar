export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") {
    const trimmed = error.trim()
    return trimmed || fallback
  }

  if (error instanceof Error) {
    const trimmed = error.message.trim()
    return trimmed || fallback
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) {
      return message.trim()
    }
  }

  return fallback
}
