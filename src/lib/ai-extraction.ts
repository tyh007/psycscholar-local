import { ollamaClient } from '@/lib/ollama-client'
import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'
import { type ExtractedData } from '@/lib/database'

export interface ExtractionProgress {
  paperId: string
  fileName: string
  status: 'pending' | 'extracting' | 'completed' | 'error'
  progress: number
  currentStep: string
  error?: string
}

export interface ExtractionOptions {
  model?: string
  detailLevel: 'brief' | 'detailed'
  customFields?: CustomFieldDefinition[]
  temperature?: number
  maxRetries?: number
}

export interface ExtractionResult {
  success: boolean
  extractedData?: ExtractedData
  error?: string
  processingTime?: number
  modelUsed?: string
}

export class AIExtractionService {
  private static instance: AIExtractionService
  private progressCallbacks: Map<string, (progress: ExtractionProgress) => void> = new Map()

  static getInstance(): AIExtractionService {
    if (!AIExtractionService.instance) {
      AIExtractionService.instance = new AIExtractionService()
    }
    return AIExtractionService.instance
  }

  async checkModelAvailability(model?: string): Promise<{ available: boolean; models: string[]; error?: string }> {
    try {
      const isConnected = await ollamaClient.checkConnection()
      if (!isConnected) {
        return { 
          available: false, 
          models: [], 
          error: 'Cannot connect to Ollama. Please ensure Ollama is running on localhost:11434' 
        }
      }

      const availableModels = await ollamaClient.getAvailableModels()
      const targetModel = model || ollamaClient.getDefaultModel()
      const isModelAvailable = await ollamaClient.isModelAvailable(targetModel)

      return {
        available: isModelAvailable,
        models: availableModels.map(m => m.name)
      }
    } catch (error) {
      return {
        available: false,
        models: [],
        error: error instanceof Error ? error.message : 'Unknown error checking model availability'
      }
    }
  }

  async extractFromPaper(
    paperText: string,
    options: ExtractionOptions,
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<ExtractionResult> {
    const startTime = Date.now()
    const model = options.model || ollamaClient.getDefaultModel()
    const maxRetries = options.maxRetries || 2

    try {
      // Check model availability first
      const modelCheck = await this.checkModelAvailability(model)
      if (!modelCheck.available) {
        throw new Error(modelCheck.error || 'Model not available')
      }

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 10,
        currentStep: 'Building extraction prompt...'
      })

      // Build the extraction prompt
      const prompt = PromptBuilder.buildExtractionPrompt(
        paperText,
        options.detailLevel,
        options.customFields
      )

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 30,
        currentStep: 'Sending to AI model...'
      })

      // Extract data with retry logic
      let lastError: Error | null = null
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          onProgress?.({
            paperId: 'current',
            fileName: 'current',
            status: 'extracting',
            progress: 50,
            currentStep: `Processing with AI (attempt ${attempt}/${maxRetries})...`
          })

          const messages = [
            { role: 'system' as const, content: prompt.systemPrompt },
            { role: 'user' as const, content: prompt.userPrompt }
          ]

          const response = await ollamaClient.chat({
            model,
            messages,
            options: {
              temperature: options.temperature || 0.1,
              max_tokens: 4000
            }
          })

          console.log('AI response received:', response.message.content.substring(0, 200) + '...')

          onProgress?.({
            paperId: 'current',
            fileName: 'current',
            status: 'extracting',
            progress: 80,
            currentStep: 'Parsing AI response...'
          })

          // Parse and validate the response
          const cleanedResponse = PromptBuilder.sanitizeResponse(response.message.content)
          console.log('Cleaned response:', cleanedResponse.substring(0, 200) + '...')
          
          const extractedData = JSON.parse(cleanedResponse) as ExtractedData
          console.log('Parsed extractedData keys:', Object.keys(extractedData))

          // Validate required fields
          const requiredFields = ['background', 'theory', 'methodology', 'measures', 'results', 'implications', 'limitations']
          const missingFields = requiredFields.filter(field => !(field in extractedData))
          
          if (missingFields.length > 0) {
            console.warn('Missing required fields in extraction:', missingFields)
            // Fill missing fields with default values
            missingFields.forEach(field => {
              (extractedData as any)[field] = 'Not extracted'
            })
          }

          onProgress?.({
            paperId: 'current',
            fileName: 'current',
            status: 'completed',
            progress: 100,
            currentStep: 'Extraction completed successfully'
          })

          return {
            success: true,
            extractedData,
            processingTime: Date.now() - startTime,
            modelUsed: model
          }

        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error during extraction')
          console.warn(`Extraction attempt ${attempt} failed:`, lastError.message)
          
          if (attempt === maxRetries) {
            throw lastError
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }

      throw lastError || new Error('All extraction attempts failed')

    } catch (error) {
      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'error',
        progress: 0,
        currentStep: 'Extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during extraction',
        processingTime: Date.now() - startTime
      }
    }
  }

  async extractCustomField(
    paperText: string,
    customField: CustomFieldDefinition,
    options: { detailLevel: 'brief' | 'detailed' } & Partial<Omit<ExtractionOptions, 'customFields'>> = { detailLevel: 'brief' },
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    try {
      const modelCheck = await this.checkModelAvailability(options.model)
      if (!modelCheck.available) {
        throw new Error(modelCheck.error || 'Model not available')
      }

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 50,
        currentStep: `Extracting custom field: ${customField.name}...`
      })

      const prompt = PromptBuilder.buildCustomFieldPrompt(
        paperText,
        customField,
        options.detailLevel
      )

      const result = await ollamaClient.generateText(prompt, options.model, {
        temperature: options.temperature || 0.1
      })

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'completed',
        progress: 100,
        currentStep: 'Custom field extraction completed'
      })

      return {
        success: true,
        result: result.trim()
      }

    } catch (error) {
      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'error',
        progress: 0,
        currentStep: 'Custom field extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during custom field extraction'
      }
    }
  }

  async reExtractFields(
    paperText: string,
    existingExtraction: ExtractedData,
    fieldsToUpdate: string[],
    options: ExtractionOptions,
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<ExtractionResult> {
    try {
      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 20,
        currentStep: 'Building re-extraction prompt...'
      })

      const prompt = PromptBuilder.buildReExtractionPrompt(
        paperText,
        existingExtraction,
        fieldsToUpdate,
        options.detailLevel
      )

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 50,
        currentStep: 'Re-extracting specified fields...'
      })

      const messages = [
        { role: 'system' as const, content: prompt.systemPrompt },
        { role: 'user' as const, content: prompt.userPrompt }
      ]

      const response = await ollamaClient.chat({
        model: options.model || ollamaClient.getDefaultModel(),
        messages,
        options: {
          temperature: options.temperature || 0.1
        }
      })

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 80,
        currentStep: 'Parsing updated extraction...'
      })

      const cleanedResponse = PromptBuilder.sanitizeResponse(response.message.content)
      const updatedExtraction = JSON.parse(cleanedResponse) as ExtractedData

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'completed',
        progress: 100,
        currentStep: 'Re-extraction completed successfully'
      })

      return {
        success: true,
        extractedData: updatedExtraction,
        modelUsed: options.model || ollamaClient.getDefaultModel()
      }

    } catch (error) {
      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'error',
        progress: 0,
        currentStep: 'Re-extraction failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during re-extraction'
      }
    }
  }

  async performCrossPaperAnalysis(
    papers: Array<{
      title: string
      authors: string
      year: number
      extractedData: ExtractedData
    }>,
    analysisQuestion: string,
    model?: string
  ): Promise<{ success: boolean; analysis?: string; error?: string }> {
    try {
      const modelCheck = await this.checkModelAvailability(model)
      if (!modelCheck.available) {
        throw new Error(modelCheck.error || 'Model not available')
      }

      const prompt = PromptBuilder.buildCrossPaperAnalysisPrompt(papers, analysisQuestion)
      
      const analysis = await ollamaClient.generateText(prompt, model, {
        temperature: 0.2,
        max_tokens: 6000
      })

      return {
        success: true,
        analysis
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during cross-paper analysis'
      }
    }
  }

  async testExtraction(
    sampleText: string,
    options: ExtractionOptions
  ): Promise<{ success: boolean; result?: ExtractedData; error?: string; latency?: number }> {
    const startTime = Date.now()
    
    try {
      const result = await this.extractFromPaper(sampleText, options)
      
      return {
        success: result.success,
        result: result.extractedData,
        error: result.error,
        latency: Date.now() - startTime
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during test extraction',
        latency: Date.now() - startTime
      }
    }
  }

  subscribeToProgress(paperId: string, callback: (progress: ExtractionProgress) => void): void {
    this.progressCallbacks.set(paperId, callback)
  }

  unsubscribeFromProgress(paperId: string): void {
    this.progressCallbacks.delete(paperId)
  }

  private notifyProgress(paperId: string, progress: ExtractionProgress): void {
    const callback = this.progressCallbacks.get(paperId)
    if (callback) {
      callback(progress)
    }
  }
}

export const aiExtractionService = AIExtractionService.getInstance()
