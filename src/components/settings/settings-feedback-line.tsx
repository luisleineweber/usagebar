/** One status or error line for the last settings action in a section. */
export function SettingsFeedbackLine({
  message,
  error,
}: {
  message: string | null
  error: string | null
}) {
  if (message) {
    return (
      <p role="status" className="mt-3 text-xs text-primary">
        {message}
      </p>
    )
  }
  if (error) {
    return (
      <p role="alert" className="mt-3 text-xs text-destructive">
        {error}
      </p>
    )
  }
  return null
}
