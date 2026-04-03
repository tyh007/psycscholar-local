import { CloudAIServiceFactory, type CloudAIService, CLOUD_AI_CONFIG } from './cloud-ai-client'

// 定义 ExtractedData 接口
export interface ExtractedData {
  background: string
  theory: string
  methodology: string
  measures: string
  results: string
  implications: string
  limitations: string
}

export interface CloudExtractionOptions {
  service: 'gemini' | 'huggingface'
  temperature?: number
  maxTokens?: number
}

export interface CloudExtractionResult {
  success: boolean
  extractedData?: ExtractedData
  error?: string
  processingTime: number
  service: string
}

export class CloudAIExtractionService {
  private service: CloudAIService

  constructor(service: CloudAIService) {
    this.service = service
  }

  async extractFromPaper(
    paperText: string,
    options: CloudExtractionOptions = { service: 'gemini' }
  ): Promise<CloudExtractionResult> {
    const startTime = Date.now()
    
    try {
      console.log(`Starting cloud AI extraction with ${this.service.name}`)
      
      // 准备提取的文本（限制长度）
      const textToExtract = paperText.substring(0, 4000)
      
      // 调用云端 AI 服务
      const response = await this.service.extractFromPaper(textToExtract)
      
      console.log(`Cloud AI response received from ${this.service.name}`)
      
      // 解析响应
      const extractedData = this.parseResponse(response)
      
      // 验证必需字段
      const validatedData = this.validateExtractedData(extractedData)
      
      return {
        success: true,
        extractedData: validatedData,
        processingTime: Date.now() - startTime,
        service: this.service.name
      }
      
    } catch (error) {
      console.error(`Cloud AI extraction failed with ${this.service.name}:`, error)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown cloud AI error',
        processingTime: Date.now() - startTime,
        service: this.service.name
      }
    }
  }

  private parseResponse(response: string): Partial<ExtractedData> {
    try {
      // 尝试直接解析 JSON
      const cleaned = response.trim()
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        return JSON.parse(cleaned)
      }
      
      // 尝试提取 JSON 部分
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      
      // 如果无法解析，返回基本结构
      return this.createFallbackData(response)
      
    } catch (error) {
      console.warn('Failed to parse AI response:', error)
      return this.createFallbackData(response)
    }
  }

  private validateExtractedData(data: Partial<ExtractedData>): ExtractedData {
    const requiredFields = ['background', 'theory', 'methodology', 'measures', 'results', 'implications', 'limitations']
    const validated: ExtractedData = {} as ExtractedData
    
    for (const field of requiredFields) {
      const value = data[field as keyof ExtractedData]
      validated[field as keyof ExtractedData] = value || 'Not extracted'
    }
    
    return validated
  }

  private createFallbackData(response: string): Partial<ExtractedData> {
    // 基于响应内容创建基本提取
    const lines = response.split('\n').filter(line => line.trim())
    
    return {
      background: lines[0] || 'Not extracted',
      theory: lines[1] || 'Not extracted',
      methodology: lines[2] || 'Not extracted',
      measures: lines[3] || 'Not extracted',
      results: lines[4] || 'Not extracted',
      implications: lines[5] || 'Not extracted',
      limitations: lines[6] || 'Not extracted'
    }
  }
}

// 云端 AI 服务管理器
export class CloudAIManager {
  private static instance: CloudAIManager
  private currentService: CloudAIService | null = null

  static getInstance(): CloudAIManager {
    if (!CloudAIManager.instance) {
      CloudAIManager.instance = new CloudAIManager()
    }
    return CloudAIManager.instance
  }

  async initializeService(service: 'gemini' | 'huggingface'): Promise<boolean> {
    try {
      switch (service) {
        case 'gemini':
          const geminiApiKey = CLOUD_AI_CONFIG.gemini.apiKey
          if (!geminiApiKey) {
            console.warn('Gemini API key not found')
            return false
          }
          this.currentService = CloudAIServiceFactory.createGemini(geminiApiKey)
          break
          
        case 'huggingface':
          const hfApiKey = CLOUD_AI_CONFIG.huggingface.apiKey
          if (!hfApiKey) {
            console.warn('HuggingFace API key not found, using public models')
            // 即使没有 API 密钥也尝试使用公共模型
            this.currentService = CloudAIServiceFactory.createHuggingFace('') // 空字符串使用公共模型
          } else {
            this.currentService = CloudAIServiceFactory.createHuggingFace(hfApiKey)
          }
          break
          
        default:
          return false
      }
      
      console.log(`Cloud AI service initialized: ${service}`)
      return true
      
    } catch (error) {
      console.error('Failed to initialize cloud AI service:', error)
      return false
    }
  }

  async extractFromPaper(paperText: string): Promise<CloudExtractionResult> {
    if (!this.currentService) {
      throw new Error('No cloud AI service initialized')
    }

    const extractionService = new CloudAIExtractionService(this.currentService)
    return extractionService.extractFromPaper(paperText)
  }

  isServiceAvailable(): boolean {
    return this.currentService !== null
  }

  getCurrentServiceName(): string {
    return this.currentService ? this.currentService.name : 'None'
  }
}

// 导出单例实例
export const cloudAIManager = CloudAIManager.getInstance()
