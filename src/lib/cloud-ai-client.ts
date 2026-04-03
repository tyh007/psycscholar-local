// Google Gemini API Client
export interface GeminiMessage {
  role: 'user' | 'model'
  parts: {
    text: string
  }[]
}

export interface GeminiRequest {
  contents: GeminiMessage[]
  generationConfig?: {
    temperature?: number
    topP?: number
    maxOutputTokens?: number
  }
}

export interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string
      }[]
    }
    finishReason: string
  }[]
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export class GeminiClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  }

  async generateContent(request: GeminiRequest, model: string = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.0-flash'): Promise<GeminiResponse> {
    const modelNames = [
      model,
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest'
    ]
    
    let lastError: Error | null = null
    
    for (const modelName of modelNames) {
      try {
        const url = `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request)
        })

        if (response.ok) {
          const data = await response.json()
          console.log(`Successfully used model: ${modelName}`)
          return data
        } else {
          const errorText = await response.text()
          lastError = new Error(`Gemini API error with ${modelName}: ${response.status} ${response.statusText} - ${errorText}`)
          console.warn(`Failed to use model ${modelName}:`, errorText)
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`Unknown error with ${modelName}`)
        console.warn(`Error with model ${modelName}:`, error)
      }
    }
    
    throw lastError || new Error('All Gemini models failed')
  }

  async extractFromPaper(paperText: string): Promise<string> {
    const prompt = `Please analyze this research paper and provide a brief JSON response with the following fields:
{
  "background": "Main research background",
  "theory": "Theoretical framework", 
  "methodology": "Research methods",
  "measures": "Key measures used",
  "results": "Main findings",
  "implications": "Research implications",
  "limitations": "Study limitations"
}

Paper text: ${paperText.substring(0, 4000)}`

    const request: GeminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000
      }
    }

    const response = await this.generateContent(request)
    
    if (response.candidates.length === 0) {
      throw new Error('No response from Gemini API')
    }

    return response.candidates[0].content.parts[0].text
  }
}

// Hugging Face Inference API Client
export interface HuggingFaceRequest {
  inputs: string
  parameters?: {
    temperature?: number
    max_new_tokens?: number
    top_p?: number
  }
}

export interface HuggingFaceResponse {
  generated_text?: string
  error?: string
}

export class HuggingFaceClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.baseUrl = 'https://api-inference.huggingface.co'
  }

  async generateText(model: string, request: HuggingFaceRequest): Promise<HuggingFaceResponse> {
    const url = `${this.baseUrl}/models/${model}`

    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
    }
    
    // 只有在有 API 密钥时才添加 Authorization 头
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    return data
  }

  async extractFromPaper(paperText: string): Promise<string> {
    const prompt = `Analyze this research and provide JSON:
{
  "background": "Main background",
  "theory": "Theory used",
  "methodology": "Methods", 
  "measures": "Measures",
  "results": "Findings",
  "implications": "Implications",
  "limitations": "Limitations"
}

Text: ${paperText.substring(0, 3000)}`

    const request: HuggingFaceRequest = {
      inputs: prompt,
      parameters: {
        temperature: 0.1,
        max_new_tokens: 500
      }
    }

    // 使用免费的文本生成模型
    const response = await this.generateText('microsoft/DialoGPT-medium', request)
    
    if (response.error) {
      throw new Error(response.error)
    }

    return response.generated_text || ''
  }
}

// Cloud AI Service Factory
export interface CloudAIService {
  name: string
  extractFromPaper(paperText: string): Promise<string>
}

export class CloudAIServiceFactory {
  static createGemini(apiKey: string): CloudAIService {
    const client = new GeminiClient(apiKey)
    return {
      name: 'Google Gemini',
      extractFromPaper: (paperText: string) => client.extractFromPaper(paperText)
    }
  }

  static createHuggingFace(apiKey: string): CloudAIService {
    const client = new HuggingFaceClient(apiKey)
    return {
      name: 'Hugging Face',
      extractFromPaper: (paperText: string) => client.extractFromPaper(paperText)
    }
  }
}

// 默认配置
export const CLOUD_AI_CONFIG = {
  gemini: {
    apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
    model: process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.0-flash'
  },
  huggingface: {
    apiKey: '', // 留空使用公共模型
    model: 'microsoft/DialoGPT-medium' // 免费模型
  }
}
