import { AsyncLocalStorage } from 'node:async_hooks'

const apiKeys = new AsyncLocalStorage<string | null>()

export function withUserApiKey<T>(apiKey: string | undefined, operation: () => T): T {
  return apiKeys.run(apiKey || null, operation)
}

export function getRequestApiKey(): string | null {
  return apiKeys.getStore() ?? null
}
