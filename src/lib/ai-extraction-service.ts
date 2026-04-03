// 统一的 AI 提取服务
// 当前测试模式: 仅使用 Ollama，禁用其他后端避免串行重试影响效率

export interface ExtractedPaperData {
  background: string
  theory: string
  methodology: string
  measures: string
  results: string
  implications: string
  limitations: string
}

export interface AIExtractionService {
  name: string
  extract: (text: string) => Promise<ExtractedPaperData>
  isAvailable: () => Promise<boolean>
}

// ============ Gemini 客户端 ============
class GeminiAIClient implements AIExtractionService {
  name = 'Google Gemini'
  private apiKey: string
  private model: string
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
    this.model = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.0-flash'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  async extract(text: string): Promise<ExtractedPaperData> {
    const prompt = `You are an academic paper analyzer. Extract key information from this paper.

Return ONLY valid JSON (no other text):
{
  "background": "2-3 sentences",
  "theory": "2-3 sentences",
  "methodology": "2-3 sentences",
  "measures": "2-3 sentences",
  "results": "2-3 sentences",
  "implications": "2-3 sentences",
  "limitations": "2-3 sentences"
}

If a section is missing, return "Not extracted" for that field.

Paper text:
${text.substring(0, 12000)}`

    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini error: ${response.status} - ${err}`)
    }

    const data = await response.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    if (!cleaned) {
      throw new Error('Empty response from Gemini')
    }

    const parsed = JSON.parse(cleaned)
    return {
      background: parsed.background || 'Not extracted',
      theory: parsed.theory || 'Not extracted',
      methodology: parsed.methodology || 'Not extracted',
      measures: parsed.measures || 'Not extracted',
      results: parsed.results || 'Not extracted',
      implications: parsed.implications || 'Not extracted',
      limitations: parsed.limitations || 'Not extracted'
    }
  }
}

// ============ Together AI 客户端 (免费在线) ============
class TogetherAIClient implements AIExtractionService {
  name = 'Together AI'
  private apiKey: string
  private model = 'meta-llama/Llama-3.2-1B-Instruct-Turbo' // 免费模型

  constructor() {
    this.apiKey = process.env.NEXT_PUBLIC_TOGETHER_API_KEY || ''
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  async extract(text: string): Promise<ExtractedPaperData> {
    const prompt = `You are an academic paper analyzer. Extract key information from this paper.

Return ONLY valid JSON (no other text):
{
  "background": "2-3 sentences",
  "theory": "2-3 sentences",
  "methodology": "2-3 sentences", 
  "measures": "2-3 sentences",
  "results": "2-3 sentences",
  "implications": "2-3 sentences",
  "limitations": "2-3 sentences"
}

Paper text:
${text.substring(0, 6000)}`

    const response = await fetch('https://api.together.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 800
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Together AI error: ${response.status} - ${err}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    
    const parsed = JSON.parse(jsonMatch[0])
    return {
      background: parsed.background || 'Not extracted',
      theory: parsed.theory || 'Not extracted',
      methodology: parsed.methodology || 'Not extracted',
      measures: parsed.measures || 'Not extracted',
      results: parsed.results || 'Not extracted',
      implications: parsed.implications || 'Not extracted',
      limitations: parsed.limitations || 'Not extracted'
    }
  }
}

// ============ Ollama 本地客户端 ============
class OllamaClient implements AIExtractionService {
  name = 'Ollama (local)'
  private model = 'qwen2.5:3b'
  private baseUrl = 'http://localhost:11434'
  private requestTimeoutMs = 90000

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async extract(text: string): Promise<ExtractedPaperData> {
    const prompt = `Analyze this paper and extract key sections as JSON:

{
  "background": "2-3 sentences",
  "theory": "2-3 sentences",
  "methodology": "2-3 sentences",
  "measures": "2-3 sentences", 
  "results": "2-3 sentences",
  "implications": "2-3 sentences",
  "limitations": "2-3 sentences"
}

Paper: ${text.substring(0, 5000)}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.3, num_predict: 800 }
        }),
        signal: controller.signal
      })
      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama error: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      const content = data.response || ''
      
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      
      const parsed = JSON.parse(jsonMatch[0])
      return {
        background: parsed.background || 'Not extracted',
        theory: parsed.theory || 'Not extracted',
        methodology: parsed.methodology || 'Not extracted',
        measures: parsed.measures || 'Not extracted',
        results: parsed.results || 'Not extracted',
        implications: parsed.implications || 'Not extracted',
        limitations: parsed.limitations || 'Not extracted'
      }
    } catch (error) {
      clearTimeout(timeout)

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `Ollama request timed out after ${Math.round(this.requestTimeoutMs / 1000)}s. ` +
          'The local model may still be loading or generating too slowly.'
        )
      }

      throw error
    }
  }
}

// ============ 规则提取 (兜底方案) ============
class RuleBasedExtraction implements AIExtractionService {
  name = 'Rule-based extraction'
  
  async isAvailable(): Promise<boolean> {
    return true // 始终可用
  }

  async extract(text: string): Promise<ExtractedPaperData> {
    const paragraphs = text.split(/\n\n+/).filter(p => p.length > 50)
    
    const findSection = (keywords: string[]) => {
      for (const para of paragraphs.slice(0, 20)) {
        const lower = para.toLowerCase()
        if (keywords.some(k => lower.includes(k))) {
          return para.substring(0, 300)
        }
      }
      return 'Not extracted'
    }

    return {
      background: findSection(['background', 'introduction', 'literature review', 'previous study']),
      theory: findSection(['theory', 'theoretical', 'hypothesis']),
      methodology: findSection(['method', 'participants', 'procedure', 'design']),
      measures: findSection(['measure', 'instrument', 'scale', 'assessment', 'test']),
      results: findSection(['result', 'finding', 'analysis', 'statistic']),
      implications: findSection(['implication', 'discussion', 'conclusion']),
      limitations: findSection(['limitation', 'constraint', 'future'])
    }
  }
}

// ============ 统一的提取入口 ============
class UnifiedExtractionService {
  private services: AIExtractionService[] = [
    new OllamaClient()
  ]

  async extractWithFallback(text: string): Promise<{ data: ExtractedPaperData; method: string }> {
    const service = this.services[0]

    console.log(`Trying ${service.name} only...`)

    if (!(await service.isAvailable())) {
      throw new Error('Ollama is not available. Please ensure Ollama is running on localhost:11434 and the target model is installed.')
    }

    const data = await service.extract(text)
    console.log(`${service.name} extraction successful`)
    return { data, method: service.name }
  }
}

export const aiExtractionService = new UnifiedExtractionService()
