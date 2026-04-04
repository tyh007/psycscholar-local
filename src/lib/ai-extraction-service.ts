import { type ExtractedPaperData } from '@/lib/ai-extraction-types'
import { extractPaperWithRules, extractPaperWithLocalOllama } from '@/lib/local-ollama-ai'
import { getAIProviderConfig, getGeminiApiKey } from '@/lib/ai-provider-config'

class UnifiedExtractionService {
  async extractWithFallback(
    text: string,
    context?: { title?: string; abstract?: string }
  ): Promise<{ data: ExtractedPaperData; method: string; userApiKey?: boolean }> {
    const aiConfig = getAIProviderConfig()
    
    console.log('AI Provider Config:', { provider: aiConfig.provider, hasApiKey: !!aiConfig.geminiApiKey })

    // If provider is Ollama (default), try local extraction first
    if (aiConfig.provider === 'ollama') {
      console.log('Attempting Ollama extraction (local)...')
      try {
        const ollamaResult = await extractPaperWithLocalOllama(text)
        console.log('Local Ollama extraction successful')
        return { 
          data: ollamaResult.extractedData, 
          method: 'Local Ollama'
        }
      } catch (error) {
        console.error('Local Ollama extraction failed:', error)
        // Continue to fallback
      }
    }

    // If provider is Gemini or Ollama failed, try Gemini with user's API key
    if (aiConfig.provider === 'gemini' || aiConfig.geminiApiKey) {
      console.log('Attempting Gemini extraction (cloud) with user API key...')
      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'extractPaper',
            paperText: text,
            detailLevel: 'brief',
            customFields: undefined,
            userApiKey: getGeminiApiKey() // Pass user's API key
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`API error: ${response.status} - ${errorText}`)
        }

        const result = await response.json()
        
        if (!result.success) {
          throw new Error(`Extraction failed: ${result.error || 'Unknown error'}`)
        }

        console.log(`Gemini extraction successful`)
        return { 
          data: result.extractedData, 
          method: 'Google Gemini',
          userApiKey: true
        }
      } catch (error) {
        console.warn('Gemini extraction failed:', error)
        // Continue to fallback
      }
    }

    // Final fallback: rule-based extraction
    console.log('Using rule-based fallback extraction')
    const fallback = extractPaperWithRules(text)
    return { 
      data: fallback, 
      method: 'Rules-based fallback'
    }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
