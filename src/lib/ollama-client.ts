export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaRequest {
  model: string
  messages: OllamaMessage[]
  stream?: boolean
  options?: {
    temperature?: number
    top_p?: number
    max_tokens?: number
    repeat_penalty?: number
  }
}

export interface OllamaResponse {
  model: string
  created_at: string
  message: {
    role: 'assistant'
    content: string
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaModel {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

export class OllamaClient {
  private baseUrl: string
  private defaultModel: string

  constructor(baseUrl: string = 'http://localhost:11434', defaultModel: string = 'qwen2.5:3b') {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.defaultModel = defaultModel
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      return response.ok
    } catch (error) {
      console.error('Ollama connection check failed:', error)
      return false
    }
  }

  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.models || []
    } catch (error) {
      console.error('Failed to get available models:', error)
      throw error
    }
  }

  async isModelAvailable(model: string): Promise<boolean> {
    try {
      const models = await this.getAvailableModels()
      console.log('Available models:', models.map(m => m.name))
      console.log('Looking for model:', model)
      
      return models.some(m => {
        const modelName = m.name.toLowerCase()
        const searchModel = model.toLowerCase()
        
        // Exact match
        if (modelName === searchModel) return true
        
        // Partial match for qwen models
        if (searchModel.includes('qwen') && modelName.includes('qwen')) {
          // Check if the version matches
          if (searchModel.includes('3.5') && modelName.includes('3.5')) return true
          if (searchModel.includes('2.5') && modelName.includes('2.5')) return true
          // If no specific version, any qwen model matches
          if (!searchModel.match(/\d+\.\d+/)) return true
        }
        
        return false
      })
    } catch (error) {
      console.error('Failed to check model availability:', error)
      return false
    }
  }

  async pullModel(model: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: model
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Failed to pull model:', error)
      throw error
    }
  }

  async chat(request: OllamaRequest): Promise<OllamaResponse> {
    console.log('Sending chat request to Ollama:', request.model)
    
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          messages: request.messages,
          stream: request.stream || false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
            max_tokens: 2000, // 减少最大令牌数以提高速度
            repeat_penalty: 1.1,
            num_ctx: 2048, // 限制上下文窗口大小
            ...request.options
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      console.log('Ollama chat response received')
      
      return data
    } catch (error) {
      console.error('Ollama chat error:', error)
      throw error
    }
  }

  getDefaultModel(): string {
    return this.defaultModel
  }
}

// Singleton instance
export const ollamaClient = new OllamaClient()
