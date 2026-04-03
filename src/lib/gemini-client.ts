// Google Gemini API 客户端 - 免费额度 generous
// 注册: https://ai.google.dev/
// 免费额度: 每分钟 60 次请求，完全免费

export interface GeminiConfig {
  apiKey: string
  model?: string
}

export class GeminiClient {
  private apiKey: string
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  private model = 'gemini-2.0-flash'

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey
    if (config.model) {
      this.model = config.model
    }
  }

  async generateContent(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`
    
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${error}`)
    }

    const data = await response.json()
    
    // 解析响应
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      throw new Error('Empty response from Gemini API')
    }
    
    return content
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
    const prompt = `Analyze this academic paper text and extract the following sections. 
Return ONLY a valid JSON object with these exact keys: background, theory, methodology, measures, results, implications, limitations.
Each value should be 2-4 sentences summarizing that section.
If a section is not clearly found, use "Not found".

Paper text (first 8000 chars):
${text.substring(0, 8000)}

Required JSON format:
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
      const content = await this.generateContent(prompt)
      
      // 清理响应并解析 JSON
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
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
    } catch (error) {
      console.error('Gemini extraction failed:', error)
      throw error
    }
  }
}

// 配置 - 使用标准模型
export const GEMINI_CONFIG: GeminiConfig = {
  apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
  model: process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.0-flash'
}

// 导出客户端实例
export const geminiClient = GEMINI_CONFIG.apiKey ? new GeminiClient(GEMINI_CONFIG) : null
