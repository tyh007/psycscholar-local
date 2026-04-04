/**
 * AI Provider Configuration Management
 * Allows users to choose between Ollama (local) and Gemini (cloud)
 * Default: Ollama (local)
 */

export type AIProvider = 'ollama' | 'gemini'

export interface AIProviderConfig {
  provider: AIProvider
  geminiApiKey?: string
}

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'ollama', // Default to local Ollama
  geminiApiKey: undefined
}

const STORAGE_KEY = 'psycscholar-ai-provider-config'

/**
 * Get current AI provider configuration from localStorage
 */
export function getAIProviderConfig(): AIProviderConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const config = JSON.parse(stored) as AIProviderConfig
      // Ensure provider is valid
      if (config.provider === 'ollama' || config.provider === 'gemini') {
        return config
      }
    }
  } catch (error) {
    console.error('Failed to read AI provider config:', error)
  }

  return DEFAULT_CONFIG
}

/**
 * Save AI provider configuration to localStorage
 */
export function saveAIProviderConfig(config: AIProviderConfig): void {
  if (typeof window === 'undefined') return

  try {
    // Validate config
    if (config.provider !== 'ollama' && config.provider !== 'gemini') {
      throw new Error('Invalid AI provider')
    }

    // Store config
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    console.log('AI provider config saved:', config)
  } catch (error) {
    console.error('Failed to save AI provider config:', error)
  }
}

/**
 * Set the active AI provider
 */
export function setAIProvider(provider: AIProvider): void {
  const config = getAIProviderConfig()
  saveAIProviderConfig({ ...config, provider })
}

/**
 * Set Gemini API key
 */
export function setGeminiApiKey(apiKey: string): void {
  const config = getAIProviderConfig()
  saveAIProviderConfig({ ...config, geminiApiKey: apiKey })
}

/**
 * Get currently configured Gemini API key
 */
export function getGeminiApiKey(): string {
  const config = getAIProviderConfig()
  return config.geminiApiKey || ''
}

/**
 * Check if Gemini is properly configured
 */
export function isGeminiConfigured(): boolean {
  const apiKey = getGeminiApiKey()
  return apiKey.length > 0
}
