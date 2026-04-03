import { type ExtractedPaperData } from '@/lib/ai-extraction-types'

type ExtractPaperResponse = {
  success: boolean
  extractedData?: ExtractedPaperData
  error?: string
}

class UnifiedExtractionService {
  async extractWithFallback(text: string): Promise<{ data: ExtractedPaperData; method: string }> {
    console.log('Trying Cloud AI via /api/ai...')

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'extractPaper',
        paperText: text,
        detailLevel: 'brief'
      })
    })

    const data = (await response.json()) as ExtractPaperResponse

    if (!response.ok || !data.success || !data.extractedData) {
      throw new Error(data.error || 'Cloud AI extraction failed')
    }

    console.log('Cloud AI extraction successful')
    return { data: data.extractedData, method: 'Cloud AI' }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
