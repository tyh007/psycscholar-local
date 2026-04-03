import { useState } from 'react'
import { db, type Paper } from '@/lib/database'
import { PDFProcessor, pdfProcessor, type ExtractedPDFContent } from '@/lib/pdf-processor'
import { aiExtractionService } from '@/lib/ai-extraction-service'

export interface UploadProgress {
  fileName: string
  progress: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
}

export interface FileUploadResult {
  success: number
  failed: number
  errors: Array<{ fileName: string; error: string }>
}

export function useFileUpload() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const processPDFFile = async (file: File, projectId: string, enableCloudAI: boolean = true): Promise<Paper> => {
    // Validate PDF file
    const validation = PDFProcessor.validatePDFFile(file)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Extract PDF content
    const extractedContent: ExtractedPDFContent = await pdfProcessor.extractPDFContent(file)
    
    // Extract bibliographic information
    const bibInfo = pdfProcessor.extractBibliographicInfo(
      extractedContent.fullText,
      extractedContent.metadata
    )

    // Create paper record with initial status
    const paper: Omit<Paper, 'id'> = {
      projectId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploadedAt: new Date(),
      processedAt: new Date(),
      title: bibInfo.title || file.name.replace('.pdf', ''),
      authors: bibInfo.authors,
      year: bibInfo.year,
      journal: bibInfo.journal,
      doi: bibInfo.doi,
      abstract: extractedContent.abstract,
      fullText: extractedContent.fullText,
      processingStatus: enableCloudAI ? 'processing' : 'completed'
    }

    // Save paper to database first
    const paperIdStr = await db.addPaper(paper)
    const paperId = parseInt(paperIdStr, 10)
    console.log('Paper saved with ID:', paperId)
    
    // Perform AI extraction if enabled and available
    if (enableCloudAI && extractedContent.fullText) {
      console.log('Starting AI extraction for:', file.name)
      
      try {
        // 使用统一的云端 AI 提取服务
        const { data: extracted, method } = await aiExtractionService.extractWithFallback(
          extractedContent.fullText
        )
        
        // 更新数据库
        await db.updatePaper(paperId, {
          extractedData: extracted,
          processingStatus: 'completed'
        })
        console.log(`Database updated (${method})`)
        
        return { ...paper, id: paperId.toString(), extractedData: extracted }
      } catch (error) {
        console.error('AI extraction failed:', error)
        await db.updatePaper(paperId, {
          processingStatus: 'completed',
          errorMessage: 'Extraction failed'
        })
        return { ...paper, id: paperId.toString() }
      }
    } else {
      console.log('AI extraction not triggered:', {
        enableCloudAI,
        hasFullText: !!extractedContent.fullText,
        fullTextLength: extractedContent.fullText?.length || 0
      })
    }

    return { ...paper, id: paperId.toString() }
  }

  const uploadFiles = async (files: File[], projectId: string): Promise<FileUploadResult> => {
    console.log('Starting upload process for', files.length, 'files to project', projectId)
    
    setIsUploading(true)
    const result: FileUploadResult = { success: 0, failed: 0, errors: [] }

    try {
      // Process files sequentially to avoid overwhelming the browser
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        setUploadProgress(prev => [
          ...prev,
          {
            fileName: file.name,
            status: 'processing',
            progress: 0
          }
        ])

        try {
          console.log('Calling processPDFFile for:', file.name)
          const paper = await processPDFFile(file, projectId)
          console.log('processPDFFile completed for:', file.name, 'paper ID:', paper.id)
          
          result.success++
          setUploadProgress(prev =>
            prev.map(p =>
              p.fileName === file.name
                ? { ...p, status: 'completed', progress: 100 }
                : p
            )
          )
        } catch (error) {
          console.error('Error processing file:', file.name, error)
          result.failed++
          result.errors.push({
            fileName: file.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          setUploadProgress(prev =>
            prev.map(p =>
              p.fileName === file.name
                ? { ...p, status: 'error', progress: 0 }
                : p
            )
          )
        }
      }

      console.log('Upload process completed:', result)
      return result
    } catch (error) {
      console.error('Upload process failed:', error)
      throw error
    } finally {
      setIsUploading(false)
      
      // Clear progress after a delay
      setTimeout(() => {
        setUploadProgress([])
      }, 3000)
    }

    return result
  }

  const validateFiles = (files: File[]): { valid: File[]; invalid: Array<{ file: File; error: string }> } => {
    const valid: File[] = []
    const invalid: Array<{ file: File; error: string }> = []

    for (const file of files) {
      const validation = PDFProcessor.validatePDFFile(file)
      if (validation.valid) {
        valid.push(file)
      } else {
        invalid.push({
          file,
          error: validation.error || 'Invalid file'
        })
      }
    }

    return { valid, invalid }
  }

  return {
    uploadFiles,
    validateFiles,
    uploadProgress,
    isUploading
  }
}
