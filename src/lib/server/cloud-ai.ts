import { type ExtractedData } from '@/lib/database'
import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const BASE_FIELDS = [
  'background',
  'theory',
  'methodology',
  'measures',
  'results',
  'implications',
  'limitations'
] as const

type BaseField = typeof BASE_FIELDS[number]

export interface CloudAIAvailability {
  available: boolean
  models: string[]
  error?: string
}

export interface CrossPaperInput {
  title: string
  authors: string
  year: number
  extractedData: ExtractedData
}

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
}

function getModelName() {
  return process.env.GEMINI_MODEL || process.env.NEXT_PUBLIC_GEMINI_MODEL || DEFAULT_MODEL
}

function normalizeJsonResponse(text: string) {
  return PromptBuilder.sanitizeResponse(text)
}

function slicePaperText(text: string, maxChars = 18000) {
  return text.slice(0, maxChars)
}

async function callGemini({
  systemPrompt,
  userPrompt,
  responseMimeType,
  temperature = 0.1,
  maxOutputTokens = 2500
}: {
  systemPrompt?: string
  userPrompt: string
  responseMimeType?: 'application/json' | 'text/plain'
  temperature?: number
  maxOutputTokens?: number
}) {
  const apiKey = getApiKey()
  const model = getModelName()

  if (!apiKey) {
    throw new Error('Cloud AI is not configured. Set GEMINI_API_KEY in the server environment.')
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...(systemPrompt
          ? {
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              }
            }
          : {}),
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          temperature,
          maxOutputTokens,
          ...(responseMimeType ? { responseMimeType } : {})
        }
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini error: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini returned an empty response.')
  }

  return text
}

function ensureString(value: unknown) {
  if (typeof value !== 'string') return 'Not mentioned'
  const trimmed = value.trim()
  return trimmed || 'Not mentioned'
}

function mapParsedExtraction(
  parsed: Record<string, unknown>,
  customFields?: CustomFieldDefinition[]
): ExtractedData {
  const baseData = Object.fromEntries(
    BASE_FIELDS.map((field) => [field, ensureString(parsed[field])])
  ) as Record<BaseField, string>

  const extractedCustomFields = customFields?.length
    ? Object.fromEntries(
        customFields
          .map((field) => [field.id, ensureString(parsed[field.id])])
          .filter(([, value]) => value !== 'Not mentioned')
      )
    : undefined

  return {
    ...baseData,
    ...(extractedCustomFields && Object.keys(extractedCustomFields).length > 0
      ? { customFields: extractedCustomFields }
      : {})
  }
}

export async function getCloudAIAvailability(): Promise<CloudAIAvailability> {
  const apiKey = getApiKey()
  const model = getModelName()

  if (!apiKey) {
    return {
      available: false,
      models: [],
      error: 'Cloud AI is not configured on the server.'
    }
  }

  return {
    available: true,
    models: [model]
  }
}

export async function extractPaperWithCloudAI(
  paperText: string,
  detailLevel: 'brief' | 'detailed',
  customFields?: CustomFieldDefinition[]
) {
  const prompt = PromptBuilder.buildExtractionPrompt(
    slicePaperText(paperText),
    detailLevel,
    customFields
  )

  const raw = await callGemini({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: detailLevel === 'detailed' ? 3200 : 2200
  })

  const parsed = JSON.parse(normalizeJsonResponse(raw)) as Record<string, unknown>
  return mapParsedExtraction(parsed, customFields)
}

export async function extractCustomFieldWithCloudAI(
  paperText: string,
  customField: CustomFieldDefinition,
  detailLevel: 'brief' | 'detailed'
) {
  const prompt = PromptBuilder.buildCustomFieldPrompt(
    slicePaperText(paperText),
    customField,
    detailLevel
  )

  const raw = await callGemini({
    userPrompt: prompt,
    responseMimeType: 'text/plain',
    temperature: 0.1,
    maxOutputTokens: detailLevel === 'detailed' ? 1400 : 700
  })

  return raw.trim()
}

export async function reExtractFieldsWithCloudAI(
  paperText: string,
  existingExtraction: ExtractedData,
  fieldsToUpdate: string[],
  detailLevel: 'brief' | 'detailed'
) {
  const prompt = PromptBuilder.buildReExtractionPrompt(
    slicePaperText(paperText),
    existingExtraction,
    fieldsToUpdate,
    detailLevel
  )

  const raw = await callGemini({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    responseMimeType: 'application/json',
    temperature: 0.1,
    maxOutputTokens: detailLevel === 'detailed' ? 3200 : 2200
  })

  const parsed = JSON.parse(normalizeJsonResponse(raw)) as Record<string, unknown>
  return mapParsedExtraction(parsed)
}

export async function performCrossPaperAnalysisWithCloudAI(
  papers: CrossPaperInput[],
  analysisQuestion: string
) {
  const prompt = PromptBuilder.buildCrossPaperAnalysisPrompt(papers, analysisQuestion)

  return callGemini({
    userPrompt: prompt,
    responseMimeType: 'text/plain',
    temperature: 0.2,
    maxOutputTokens: 3000
  })
}
