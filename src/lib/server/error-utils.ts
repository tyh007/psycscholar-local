export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message

  if (error && typeof error === 'object') {
    const maybeMessage = Reflect.get(error, 'message')
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage

    const maybeDetails = Reflect.get(error, 'details')
    if (typeof maybeDetails === 'string' && maybeDetails.trim()) return maybeDetails

    const maybeHint = Reflect.get(error, 'hint')
    if (typeof maybeHint === 'string' && maybeHint.trim()) return maybeHint

    const maybeCode = Reflect.get(error, 'code')
    if (typeof maybeCode === 'string' && maybeCode.trim()) return `${fallback} (${maybeCode})`
  }

  return fallback
}
