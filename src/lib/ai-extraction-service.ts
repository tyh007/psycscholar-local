import { type ExtractedPaperData } from '@/lib/ai-extraction-types'
import { extractPaperWithLocalOllama } from '@/lib/local-ollama-ai'

class UnifiedExtractionService {
  async extractWithFallback(text: string): Promise<{ data: ExtractedPaperData; method: string }> {
    console.log('Trying local Ollama...')
    const result = await extractPaperWithLocalOllama(text, 'brief')
    console.log('Local Ollama extraction successful')
    return { data: result.extractedData, method: `Ollama (${result.model})` }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
