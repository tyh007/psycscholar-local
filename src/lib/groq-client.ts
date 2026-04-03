// Groq API 客户端 - 免费的高速大模型API
// 注册: https://console.groq.com/keys
// 免费额度: 每月有免费的tokens

export interface GroqConfig {
  apiKey: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GroqRequest {
  model: string
  messages: GroqMessage[]
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
}

export interface GroqResponse {
  id: string
  choices: Array<{
    index: number
    message: GroqMessage
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class GroqClient {
  private apiKey: string
  private baseUrl = 'https://api.groq.com/openai/v1'
  private defaultModel = 'llama3-8b-8192' // 免费且快速的模型

  constructor(config: GroqConfig) {
    this.apiKey = config.apiKey
    if (config.model) {
      this.defaultModel = config.model
    }
  }

  async chat(messages: GroqMessage[], options?: Partial<GroqRequest>): Promise<string> {
    const request: GroqRequest = {
      model: this.defaultModel,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.max_tokens ?? 2000,
      ...options
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Groq API error: ${response.status} - ${error}`)
    }

    const data: GroqResponse = await response.json()
    return data.choices[0]?.message?.content || ''
  }

  async extractPaperInfo(text: string): Promise<{
    background: string
    theory: string
    methodology: string
    measures: string
    results: string
    implications: string
    limitations: string
  }> {
    const systemPrompt = `You are an expert at analyzing academic papers. Extract the following information from the paper text provided.
Return ONLY a JSON object with these exact keys: background, theory, methodology, measures, results, implications, limitations.
Each value should be a concise summary (2-3 sentences) of that section.
If a section is not found, use "Not found in text".`

    const userPrompt = `Analyze this academic paper and extract the key sections:

${text.substring(0, 6000)}

Return JSON format:
{
  "background": "...",
  "theory": "...",
  "methodology": "...",
  "measures": "...",
  "results": "...",
  "implications": "...",
  "limitations": "..."
}`

    try {
      const content = await this.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], {
        response_format: { type: 'json_object' }
      })

      // 解析 JSON 响应
      const parsed = JSON.parse(content)
      
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
      console.error('Groq extraction failed:', error)
      throw error
    }
  }
}

// 配置 - 使用你的 API key
export const GROQ_CONFIG: GroqConfig = {
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || '',
  model: 'llama3-8b-8192' // 或者 'mixtral-8x7b-32768', 'gemma-7b-it'
}

// 导出客户端实例
export const groqClient = GROQ_CONFIG.apiKey ? new GroqClient(GROQ_CONFIG) : null
