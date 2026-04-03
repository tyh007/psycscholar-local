import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'
import { type ExtractedData } from '@/lib/database'
import {
  extractCustomFieldWithLocalOllama,
  extractPaperWithLocalOllama,
  getLocalOllamaAvailability,
  performCrossPaperAnalysisWithLocalOllama,
  reExtractFieldsWithLocalOllama
} from '@/lib/local-ollama-ai'

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

class AIExtractionService {
  private static instance: AIExtractionService
  private progressCallbacks: Map<string, (progress: ExtractionProgress) => void> = new Map()

  static getInstance(): AIExtractionService {
    if (!AIExtractionService.instance) {
      AIExtractionService.instance = new AIExtractionService()
    }
    return AIExtractionService.instance
  }

  async checkModelAvailability(): Promise<{ available: boolean; models: string[]; error?: string }> {
    try {
      const result = await getLocalOllamaAvailability()
      return {
        available: result.available,
        models: result.models,
        error: result.available
          ? undefined
          : `Could not connect to Ollama at ${result.currentBaseUrl}. Make sure Ollama is running and at least one model is installed.`
      }
    } catch (error) {
      return {
        available: false,
        models: [],
        error: error instanceof Error ? error.message : 'Unknown error checking local Ollama availability'
      }
    }
  }

  async extractFromPaper(
    paperText: string,
    options: ExtractionOptions,
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<ExtractionResult> {
    const startTime = Date.now()
    const maxRetries = options.maxRetries || 2

    try {
      const availability = await this.checkModelAvailability()
      if (!availability.available) {
        throw new Error(availability.error || 'Local Ollama is not available')
      }

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 15,
        currentStep: 'Preparing paper for local extraction...'
      })

      let lastError: Error | null = null

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          onProgress?.({
            paperId: 'current',
            fileName: 'current',
            status: 'extracting',
            progress: 45,
            currentStep: `Running local extraction (attempt ${attempt}/${maxRetries})...`
          })

          const result = await extractPaperWithLocalOllama(
            paperText,
            options.detailLevel,
            options.customFields,
            options.model
          )

          onProgress?.({
            paperId: 'current',
            fileName: 'current',
            status: 'completed',
            progress: 100,
            currentStep: 'Extraction completed successfully'
          })

          return {
            success: true,
            extractedData: result.extractedData,
            processingTime: Date.now() - startTime,
            modelUsed: result.model
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown extraction error')
          if (attempt === maxRetries) throw lastError
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
    options: { detailLevel: 'brief' | 'detailed' } & Partial<Omit<ExtractionOptions, 'customFields'>> = {
      detailLevel: 'brief'
    },
    onProgress?: (progress: ExtractionProgress) => void
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    try {
      const availability = await this.checkModelAvailability()
      if (!availability.available) {
        throw new Error(availability.error || 'Local Ollama is not available')
      }

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'extracting',
        progress: 50,
        currentStep: `Extracting ${customField.name} with local Ollama...`
      })

      const result = await extractCustomFieldWithLocalOllama(
        paperText,
        customField,
        options.detailLevel,
        options.model
      )

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
        progress: 25,
        currentStep: 'Preparing targeted re-extraction...'
      })

      const result = await reExtractFieldsWithLocalOllama(
        paperText,
        existingExtraction,
        fieldsToUpdate,
        options.detailLevel,
        options.model
      )

      onProgress?.({
        paperId: 'current',
        fileName: 'current',
        status: 'completed',
        progress: 100,
        currentStep: 'Re-extraction completed successfully'
      })

      return {
        success: true,
        extractedData: result.extractedData,
        modelUsed: result.model
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
    analysisQuestion: string
  ): Promise<{ success: boolean; analysis?: string; error?: string }> {
    try {
      const result = await performCrossPaperAnalysisWithLocalOllama(
        papers,
        analysisQuestion
      )

      return {
        success: true,
        analysis: result
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
}

export const aiExtractionService = AIExtractionService.getInstance()

export type { CustomFieldDefinition }
export { PromptBuilder }
