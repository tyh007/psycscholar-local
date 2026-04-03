import { type ExtractedPaperData } from '@/lib/ai-extraction-types'
import { extractPaperWithLocalOllama, extractPaperWithRules } from '@/lib/local-ollama-ai'

class UnifiedExtractionService {
  async extractWithFallback(text: string): Promise<{ data: ExtractedPaperData; method: string }> {
    console.log('Trying local Ollama...')
    try {
      const result = await extractPaperWithLocalOllama(text, 'brief')
      console.log('Local Ollama extraction successful')
      return { data: result.extractedData, method: `Ollama (${result.model})` }
    } catch (error) {
      console.warn('Local Ollama extraction failed, falling back to rules:', error)
      const fallback = extractPaperWithRules(text)
      return { data: fallback, method: 'Rules fallback' }
    }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
