export interface OllamaSettings {
  baseUrl: string
  model: string
}

const STORAGE_KEY = 'psycscholar-ollama-settings'

export const DEFAULT_OLLAMA_SETTINGS: OllamaSettings = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b'
}

export function readOllamaSettings(): OllamaSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_OLLAMA_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_OLLAMA_SETTINGS

    const parsed = JSON.parse(raw) as Partial<OllamaSettings>
    return {
      baseUrl: sanitizeBaseUrl(parsed.baseUrl) || DEFAULT_OLLAMA_SETTINGS.baseUrl,
      model: parsed.model?.trim() || DEFAULT_OLLAMA_SETTINGS.model
    }
  } catch {
    return DEFAULT_OLLAMA_SETTINGS
  }
}

export function saveOllamaSettings(settings: Partial<OllamaSettings>): OllamaSettings {
  const current = readOllamaSettings()
  const next: OllamaSettings = {
    ...current,
    ...settings,
    baseUrl: sanitizeBaseUrl(settings.baseUrl) || current.baseUrl,
    model: settings.model?.trim() || current.model
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return next
}

function sanitizeBaseUrl(value?: string): string {
  return value?.trim().replace(/\/+$/, '') || ''
}
