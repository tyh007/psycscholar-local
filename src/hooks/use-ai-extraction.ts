import { useState, useCallback, useEffect } from 'react'
import { aiExtractionService, type ExtractionOptions, type ExtractionProgress } from '@/lib/ai-extraction'
import { PSYCHOLOGY_CUSTOM_FIELDS, type CustomFieldDefinition } from '@/lib/prompt-builder'

export interface AIExtractionState {
  isAvailable: boolean
  isChecking: boolean
  availableModels: string[]
  currentModel: string
  error?: string
}

export interface ExtractionJob {
  id: string
  paperId: string
  fileName: string
  status: 'pending' | 'extracting' | 'completed' | 'error'
  progress: number
  currentStep: string
  result?: any
  error?: string
  startTime: number
  endTime?: number
}

export function useAIExtraction() {
  const [aiState, setAIState] = useState<AIExtractionState>({
    isAvailable: false,
    isChecking: true,
    availableModels: [],
    currentModel: 'gemini-2.0-flash'
  })
  
  const [extractionJobs, setExtractionJobs] = useState<ExtractionJob[]>([])
  const [detailLevel, setDetailLevel] = useState<'brief' | 'detailed'>('brief')
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])

  // Check AI availability on mount
  const checkAIAvailability = useCallback(async () => {
    setAIState(prev => ({ ...prev, isChecking: true, error: undefined }))
    
    try {
      console.log('Checking AI availability...')
      const check = await aiExtractionService.checkModelAvailability()
      console.log('AI availability check result:', check)
      
      setAIState({
        isAvailable: check.available,
        isChecking: false,
        availableModels: check.models,
        currentModel: check.models[0] || 'gemini-2.0-flash',
        error: check.error
      })
      
      console.log('AI state updated:', {
        isAvailable: check.available,
        models: check.models,
        currentModel: check.models[0] || 'gemini-2.0-flash'
      })
    } catch (error) {
      console.error('AI availability check failed:', error)
      setAIState(prev => ({
        ...prev,
        isAvailable: false,
        isChecking: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
    }
  }, [])

  const setCurrentModel = useCallback((model: string) => {
    setAIState(prev => ({ ...prev, currentModel: model }))
  }, [])

  // Extract data from paper text
  const extractFromPaper = useCallback(async (
    paperId: string,
    fileName: string,
    paperText: string,
    options: Partial<ExtractionOptions> = {}
  ) => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const job: ExtractionJob = {
      id: jobId,
      paperId,
      fileName,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing extraction...',
      startTime: Date.now()
    }
    
    setExtractionJobs(prev => [...prev, job])

    try {
      const extractionOptions: ExtractionOptions = {
        model: aiState.currentModel,
        detailLevel,
        customFields,
        temperature: 0.1,
        maxRetries: 2,
        ...options
      }

      const result = await aiExtractionService.extractFromPaper(
        paperText,
        extractionOptions,
        (progress: ExtractionProgress) => {
          setExtractionJobs(prev => prev.map(job => 
            job.id === jobId 
              ? { 
                  ...job, 
                  status: progress.status as any,
                  progress: progress.progress,
                  currentStep: progress.currentStep,
                  error: progress.error
                }
              : job
          ))
        }
      )

      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: result.success ? 'completed' : 'error',
              progress: result.success ? 100 : 0,
              currentStep: result.success ? 'Extraction completed' : 'Extraction failed',
              result: result.extractedData,
              error: result.error,
              endTime: Date.now()
            }
          : job
      ))

      return result

    } catch (error) {
      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'error',
              progress: 0,
              currentStep: 'Extraction failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              endTime: Date.now()
            }
          : job
      ))

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [aiState.currentModel, detailLevel, customFields])

  // Extract custom field
  const extractCustomField = useCallback(async (
    paperId: string,
    fileName: string,
    paperText: string,
    customField: CustomFieldDefinition
  ) => {
    const jobId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const job: ExtractionJob = {
      id: jobId,
      paperId,
      fileName,
      status: 'pending',
      progress: 0,
      currentStep: `Extracting ${customField.name}...`,
      startTime: Date.now()
    }
    
    setExtractionJobs(prev => [...prev, job])

    try {
      const result = await aiExtractionService.extractCustomField(
        paperText,
        customField,
        { detailLevel, model: aiState.currentModel },
        (progress: ExtractionProgress) => {
          setExtractionJobs(prev => prev.map(job => 
            job.id === jobId 
              ? { 
                  ...job, 
                  status: progress.status as any,
                  progress: progress.progress,
                  currentStep: progress.currentStep,
                  error: progress.error
                }
              : job
          ))
        }
      )

      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: result.success ? 'completed' : 'error',
              progress: result.success ? 100 : 0,
              currentStep: result.success ? 'Custom field extracted' : 'Custom field extraction failed',
              result: result.result,
              error: result.error,
              endTime: Date.now()
            }
          : job
      ))

      return result

    } catch (error) {
      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'error',
              progress: 0,
              currentStep: 'Custom field extraction failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              endTime: Date.now()
            }
          : job
      ))

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [aiState.currentModel, detailLevel])

  // Re-extract specific fields
  const reExtractFields = useCallback(async (
    paperId: string,
    fileName: string,
    paperText: string,
    existingData: any,
    fieldsToUpdate: string[]
  ) => {
    const jobId = `reextract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const job: ExtractionJob = {
      id: jobId,
      paperId,
      fileName,
      status: 'pending',
      progress: 0,
      currentStep: 'Preparing re-extraction...',
      startTime: Date.now()
    }
    
    setExtractionJobs(prev => [...prev, job])

    try {
      const result = await aiExtractionService.reExtractFields(
        paperText,
        existingData,
        fieldsToUpdate,
        { model: aiState.currentModel, detailLevel },
        (progress: ExtractionProgress) => {
          setExtractionJobs(prev => prev.map(job => 
            job.id === jobId 
              ? { 
                  ...job, 
                  status: progress.status as any,
                  progress: progress.progress,
                  currentStep: progress.currentStep,
                  error: progress.error
                }
              : job
          ))
        }
      )

      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: result.success ? 'completed' : 'error',
              progress: result.success ? 100 : 0,
              currentStep: result.success ? 'Re-extraction completed' : 'Re-extraction failed',
              result: result.extractedData,
              error: result.error,
              endTime: Date.now()
            }
          : job
      ))

      return result

    } catch (error) {
      setExtractionJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'error',
              progress: 0,
              currentStep: 'Re-extraction failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              endTime: Date.now()
            }
          : job
      ))

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [aiState.currentModel, detailLevel])

  // Test extraction with sample text
  const testExtraction = useCallback(async (sampleText: string) => {
    try {
      const result = await aiExtractionService.testExtraction(sampleText, {
        model: aiState.currentModel,
        detailLevel
      })
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [aiState.currentModel, detailLevel])

  // Clear completed jobs
  const clearCompletedJobs = useCallback(() => {
    setExtractionJobs(prev => prev.filter(job => job.status !== 'completed'))
  }, [])

  // Clear all jobs
  const clearAllJobs = useCallback(() => {
    setExtractionJobs([])
  }, [])

  // Get active jobs count
  const getActiveJobsCount = useCallback(() => {
    return extractionJobs.filter(job => job.status === 'extracting' || job.status === 'pending').length
  }, [extractionJobs])

  // Get job by paper ID
  const getJobByPaperId = useCallback((paperId: string) => {
    return extractionJobs.find(job => job.paperId === paperId)
  }, [extractionJobs])

  // Add custom field
  const addCustomField = useCallback((field: CustomFieldDefinition) => {
    setCustomFields(prev => [...prev, field])
  }, [])

  // Remove custom field
  const removeCustomField = useCallback((fieldId: string) => {
    setCustomFields(prev => prev.filter(field => field.id !== fieldId))
  }, [])

  // Update custom field
  const updateCustomField = useCallback((fieldId: string, updates: Partial<CustomFieldDefinition>) => {
    setCustomFields(prev => prev.map(field => 
      field.id === fieldId ? { ...field, ...updates } : field
    ))
  }, [])

  // Add predefined psychology fields
  const addPsychologyFields = useCallback(() => {
    setCustomFields(prev => {
      const existingIds = new Set(prev.map(f => f.id))
      const newFields = PSYCHOLOGY_CUSTOM_FIELDS.filter(field => !existingIds.has(field.id))
      return [...prev, ...newFields]
    })
  }, [])

  // Check AI availability on mount
  useEffect(() => {
    checkAIAvailability()
  }, [checkAIAvailability])

  return {
    // AI State
    aiState,
    checkAIAvailability,
    setCurrentModel,
    
    // Extraction Jobs
    extractionJobs,
    getActiveJobsCount,
    getJobByPaperId,
    clearCompletedJobs,
    clearAllJobs,
    
    // Extraction Functions
    extractFromPaper,
    extractCustomField,
    reExtractFields,
    testExtraction,
    
    // Settings
    detailLevel,
    setDetailLevel,
    
    // Custom Fields
    customFields,
    addCustomField,
    removeCustomField,
    updateCustomField,
    addPsychologyFields
  }
}
