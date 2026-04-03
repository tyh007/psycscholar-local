import { NextResponse } from 'next/server'
import { type ExtractedData } from '@/lib/database'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'
import {
  extractCustomFieldWithCloudAI,
  extractPaperWithCloudAI,
  getCloudAIAvailability,
  performCrossPaperAnalysisWithCloudAI,
  reExtractFieldsWithCloudAI
} from '@/lib/server/cloud-ai'

type AvailabilityRequest = {
  action: 'availability'
}

type ExtractPaperRequest = {
  action: 'extractPaper'
  paperText: string
  detailLevel?: 'brief' | 'detailed'
  customFields?: CustomFieldDefinition[]
}

type ExtractCustomFieldRequest = {
  action: 'extractCustomField'
  paperText: string
  customField: CustomFieldDefinition
  detailLevel?: 'brief' | 'detailed'
}

type ReExtractRequest = {
  action: 'reExtractFields'
  paperText: string
  existingExtraction: ExtractedData
  fieldsToUpdate: string[]
  detailLevel?: 'brief' | 'detailed'
}

type CrossPaperAnalysisRequest = {
  action: 'crossPaperAnalysis'
  papers: Array<{
    title: string
    authors: string
    year: number
    extractedData: ExtractedData
  }>
  analysisQuestion: string
}

type AIRequest =
  | AvailabilityRequest
  | ExtractPaperRequest
  | ExtractCustomFieldRequest
  | ReExtractRequest
  | CrossPaperAnalysisRequest

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AIRequest

    switch (body.action) {
      case 'availability': {
        return NextResponse.json(await getCloudAIAvailability())
      }

      case 'extractPaper': {
        const extractedData = await extractPaperWithCloudAI(
          body.paperText,
          body.detailLevel || 'brief',
          body.customFields
        )

        return NextResponse.json({ success: true, extractedData })
      }

      case 'extractCustomField': {
        const result = await extractCustomFieldWithCloudAI(
          body.paperText,
          body.customField,
          body.detailLevel || 'brief'
        )

        return NextResponse.json({ success: true, result })
      }

      case 'reExtractFields': {
        const extractedData = await reExtractFieldsWithCloudAI(
          body.paperText,
          body.existingExtraction,
          body.fieldsToUpdate,
          body.detailLevel || 'brief'
        )

        return NextResponse.json({ success: true, extractedData })
      }

      case 'crossPaperAnalysis': {
        const analysis = await performCrossPaperAnalysisWithCloudAI(
          body.papers,
          body.analysisQuestion
        )

        return NextResponse.json({ success: true, analysis })
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Unsupported AI action.' },
          { status: 400 }
        )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown AI server error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
