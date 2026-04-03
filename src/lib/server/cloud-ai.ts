import { type ExtractedData } from '@/lib/database'
import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'

const DEFAULT_MODEL = 'gemini-2.0-flash'
const REQUEST_TIMEOUT_MS = 45000
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

export class CloudAIError extends Error {
  status?: number
  retryable: boolean

  constructor(message: string, options?: { status?: number; retryable?: boolean }) {
    super(message)
    this.name = 'CloudAIError'
    this.status = options?.status
    this.retryable = options?.retryable ?? false
  }
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

function slicePaperText(text: string, maxChars = 25000) {
  // Increased from 18000 to preserve more critical information
  // Try to slice at a clean paragraph boundary
  const sliced = text.slice(0, maxChars)
  const lastNewline = sliced.lastIndexOf('\n\n')
  return lastNewline > maxChars * 0.8 ? sliced.slice(0, lastNewline) : sliced
}

// Format text into bullet points
function formatAsBulletPoints(text: string, maxBullets: number = 3): string {
  if (!text || text === 'Not mentioned') return 'Not mentioned'
  
  // Split sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20)
  
  if (sentences.length === 0) return 'Not mentioned'
  
  // Take top sentences as bullet points
  const bullets = sentences.slice(0, maxBullets)
    .map(s => `• ${s}`)
    .join('\n')
  
  return bullets || text.slice(0, 200)
}

function extractWithRules(text: string): ExtractedData {
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 80)
    .filter(p => !looksLikeFrontMatter(p))

  const abstract = extractAbstractBlock(text)

  const findSection = (keywords: string[]) => {
    // Search through first 50 paragraphs for better coverage
    for (const para of paragraphs.slice(0, 50)) {
      const lower = para.toLowerCase()
      if (keywords.some(keyword => lower.includes(keyword)) && isUsableSectionParagraph(para)) {
        // Return more content (500 chars instead of 420)
        return para.slice(0, 500)
      }
    }
    // Fallback: pick sentences by keyword relevance
    const sentences = text.split(/[.!?]+/).filter(s => s.length > 50)
    for (const keyword of keywords) {
      const relevant = sentences.find(s => s.toLowerCase().includes(keyword))
      if (relevant) return relevant.trim().slice(0, 500)
    }
    return 'Not mentioned'
  }

  const findMultipleSentences = (keywords: string[], count: number = 2) => {
    const sentences = text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !looksLikeFrontMatter(s))
    
    const scored = sentences.map(s => {
      const lower = s.toLowerCase()
      const score = keywords.filter(k => lower.includes(k)).length
      return { sentence: s, score }
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)
    
    const result = scored.slice(0, count).map(item => item.sentence).join(' ').slice(0, 500) || 'Not mentioned'
    return result
  }

  const formatResult = (result: string): string => formatAsBulletPoints(result, 3)

  return {
    background: formatResult(abstract || findMultipleSentences(['background', 'introduction', 'literature', 'context', 'motivation'], 3)),
    theory: formatResult(findMultipleSentences(['theory', 'theoretical', 'hypothesis', 'framework', 'model'], 3)),
    methodology: formatResult(findMultipleSentences(['method', 'participants', 'procedure', 'design', 'sample'], 3)),
    measures: formatResult(findMultipleSentences(['measure', 'instrument', 'scale', 'assessment', 'questionnaire'], 3)),
    results: formatResult(findMultipleSentences(['result', 'finding', 'analysis', 'significant', 'effect', 'accuracy'], 3)),
    implications: formatResult(findMultipleSentences(['implication', 'discussion', 'conclusion', 'contribution', 'practical'], 3)),
    limitations: formatResult(findMultipleSentences(['limitation', 'future research', 'constraint', 'weakness'], 3))
  }
}

function extractAbstractBlock(text: string) {
  const match = text.match(/abstract\s*[:\-]?\s*\n?(.*?)(?=\n\s*(?:keywords|introduction|1\.|i\.|background|method))/is)
  if (!match?.[1]) return undefined
  const cleaned = match[1].replace(/\s+/g, ' ').trim()
  return cleaned.length >= 120 ? cleaned.slice(0, 420) : undefined
}

function looksLikeFrontMatter(paragraph: string) {
  const lower = paragraph.toLowerCase()
  return (
    /@/.test(paragraph) ||
    /(university|department|school|college|barcelona|spain|berkeley|london|received|accepted|published|copyright|permission to make)/.test(lower) ||
    /^[A-Z][A-Za-z .,&:-]{0,120}$/.test(paragraph)
  )
}

function isUsableSectionParagraph(paragraph: string) {
  const lower = paragraph.toLowerCase()
  if (/@/.test(paragraph)) return false
  if (/(university|department|school|college|barcelona|spain|berkeley|london)/.test(lower)) return false
  if (paragraph.split(/\s+/).length < 18) return false
  return true
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

  const modelCandidates = [model]
  let lastError: CloudAIError | null = null

  for (const modelName of modelCandidates) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
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
            }),
            signal: controller.signal
          }
        )
        clearTimeout(timeout)

        if (!response.ok) {
          const errorText = await response.text()
          const lower = errorText.toLowerCase()
          const retryable =
            (response.status === 429 && !lower.includes('limit: 0') && !lower.includes('perday')) ||
            response.status >= 500
          lastError = new CloudAIError(
            `Gemini error (${modelName}, attempt ${attempt}): ${response.status} - ${errorText}`,
            { status: response.status, retryable }
          )
          if (retryable && attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
            continue
          }
          break
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!text) {
          throw new Error(`Gemini returned an empty response for model ${modelName}.`)
        }

        return text
      } catch (error) {
        clearTimeout(timeout)
        const isAbort = error instanceof DOMException && error.name === 'AbortError'
        lastError = isAbort
          ? new CloudAIError(
              `Gemini request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s for model ${modelName}.`,
              { retryable: true }
            )
          : error instanceof CloudAIError
            ? error
            : error instanceof Error
              ? new CloudAIError(error.message, { retryable: false })
              : new CloudAIError(`Unknown Gemini error for model ${modelName}.`, { retryable: false })

        if (lastError.retryable && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
          continue
        }

        break
      }
    }
  }

  throw lastError || new Error('Cloud AI request failed')
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

export async function extractPaperWithFallback(
  paperText: string,
  detailLevel: 'brief' | 'detailed',
  customFields?: CustomFieldDefinition[]
) {
  try {
    const extractedData = await extractPaperWithCloudAI(paperText, detailLevel, customFields)
    return {
      extractedData,
      method: 'Google Gemini',
      fallbackUsed: false as const
    }
  } catch (error) {
    const extractedData = extractWithRules(paperText)
    return {
      extractedData,
      method: 'Rule-based fallback',
      fallbackUsed: true as const,
      warning: error instanceof Error ? error.message : 'Cloud AI failed; used fallback extraction.'
    }
  }
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
