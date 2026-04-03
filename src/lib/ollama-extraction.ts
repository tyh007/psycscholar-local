// Ollama 本地 AI 客户端 - 使用本地运行的大模型
export interface OllamaExtractionConfig {
  model?: string
  baseUrl?: string
}

export class OllamaExtractionClient {
  private model: string
  private baseUrl: string

  constructor(config: OllamaExtractionConfig = {}) {
    this.model = config.model || 'qwen3.5:latest'
    this.baseUrl = config.baseUrl || 'http://localhost:11434'
  }

  async generateContent(prompt: string, timeoutMs: number = 15000): Promise<string> {
    const url = `${this.baseUrl}/api/generate`
    
    const requestBody = {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 1024 // 减少生成长度以加快速度
      }
    }

    // 创建 AbortController 用于超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      return data.response || ''
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${timeoutMs}ms`)
      }
      throw error
    }
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
    const prompt = `You are an expert academic paper analyzer. Analyze this paper text and extract key sections.

Return ONLY a JSON object with these exact keys: background, theory, methodology, measures, results, implications, limitations.
Each value should be 2-4 sentences summarizing that section. Be concise but informative.

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
      console.log('Sending extraction request to Ollama...')
      const content = await this.generateContent(prompt)
      console.log('Ollama response received, parsing...')
      
      // 提取 JSON 部分
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }
      
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
      console.error('Ollama extraction failed:', error)
      throw error
    }
  }

  // 检查 Ollama 是否可用
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// 导出单例
export const ollamaExtractionClient = new OllamaExtractionClient()
