import { type ExtractedPaperData } from '@/lib/ai-extraction-types'
import { extractPaperWithRules } from '@/lib/local-ollama-ai'

class UnifiedExtractionService {
  async extractWithFallback(
    text: string,
    context?: { title?: string; abstract?: string }
  ): Promise<{ data: ExtractedPaperData; method: string }> {
    console.log('Initiating AI extraction via API endpoint...')
    try {
      // Call the extraction API endpoint with the paper text
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extractPaper',
          paperText: text,
          detailLevel: 'brief',
          customFields: undefined
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

      console.log(`Cloud AI extraction successful via ${result.method}`)
      return { 
        data: result.extractedData, 
        method: result.method || 'Cloud AI'
      }
    } catch (error) {
      console.warn('Cloud AI extraction failed, falling back to rules-based extraction:', error)
      // Fallback to rule-based extraction
      const fallback = extractPaperWithRules(text)
      return { 
        data: fallback, 
        method: 'Rules-based fallback'
      }
    }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
