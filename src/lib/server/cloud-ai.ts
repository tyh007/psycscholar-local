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

// Advanced text cleaning
function cleanAndNormalizeText(text: string): string {
  return text
    // Remove page numbers and page markers
    .replace(/^[\s\d]*\n/gm, '')
    .replace(/\n[\s\d]*$/gm, '')
    // Remove repeated whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    // Remove common artifacts
    .replace(/\b(?:Table|Figure)\s+\d+[:\s\-].*?(?=\n\n|\n[A-Z])/is, '')
    .trim()
}

// Detect and remove duplicate sentences/paragraphs
function deduplicateText(text: string): string {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  const deduplicated: string[] = []
  
  for (const para of paragraphs) {
    // Normalize for comparison (lowercase, remove extra spaces)
    const normalized = para.toLowerCase().replace(/\s+/g, ' ')
    
    // Check if this paragraph or similar ones have been seen
    let isDuplicate = false
    for (const seenPara of seen) {
      // Calculate similarity
      const similarity = calculateStringSimilarity(normalized, seenPara)
      if (similarity > 0.75) {
        isDuplicate = true
        break
      }
    }
    
    if (!isDuplicate) {
      seen.add(normalized)
      deduplicated.push(para)
    }
  }
  
  return deduplicated.join('\n\n')
}

// Simple similarity scoring
function calculateStringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  
  if (longer.length === 0) return 1.0
  
  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

// Levenshtein distance for similarity
function getEditDistance(a: string, b: string): number {
  const costs: number[] = []
  for (let i = 0; i <= a.length; i++) {
    let lastValue = i
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (a.charAt(i - 1) !== b.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[b.length] = lastValue
  }
  return costs[b.length]
}

// Format text into bullet points with better deduplication
function formatAsBulletPoints(text: string, maxBullets: number = 3): string {
  if (!text || text === 'Not mentioned') return 'Not mentioned'
  
  // If already formatted as bullets, verify and clean
  if (text.includes('•')) {
    const bullets = text.split('\n').filter(line => line.trim().startsWith('•'))
    if (bullets.length > 0) {
      // Remove duplicates and limit
      const seen = new Set<string>()
      const unique: string[] = []
      for (const bullet of bullets) {
        const normalized = bullet.toLowerCase()
        if (!seen.has(normalized)) {
          seen.add(normalized)
          unique.push(bullet)
        }
      }
      return unique.slice(0, maxBullets).join('\n')
    }
  }
  
  // Clean the text first
  const cleaned = cleanAndNormalizeText(text)
  
  // Split into sentences, filtering duplicates and noise
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => {
      // Minimum length 25 chars
      if (s.length < 25) return false
      // Filter out common artifacts
      if (/^(fig|table|ref|page|www|http|author|affiliation)/i.test(s)) return false
      // Filter incomplete sentences
      if (s.endsWith('...') || s.endsWith('–')) return false
      return true
    })
  
  if (sentences.length === 0) return 'Not mentioned'
  
  // Deduplicate sentences with better matching
  const seenSentences = new Set<string>()
  const uniqueSentences: string[] = []
  
  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase()
    
    // Check for exact duplicates
    if (seenSentences.has(normalized)) continue
    
    // Check for partial duplicates (>80% similarity)
    let isDuplicate = false
    for (const seen of seenSentences) {
      if (calculateStringSimilarity(normalized, seen) > 0.80) {
        isDuplicate = true
        break
      }
    }
    
    if (!isDuplicate) {
      seenSentences.add(normalized)
      uniqueSentences.push(sentence)
    }
  }
  
  if (uniqueSentences.length === 0) return 'Not mentioned'
  
  // Format as bullet points
  const bullets = uniqueSentences.slice(0, maxBullets)
    .map(s => `• ${s}`)
    .join('\n')
  
  return bullets || 'Not mentioned'
}

function extractWithRules(text: string): ExtractedData {
  // Clean and deduplicate text first
  const cleanedText = cleanAndNormalizeText(text)
  const dedupedText = deduplicateText(cleanedText)
  
  const paragraphs = dedupedText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 80)
    .filter(p => !looksLikeFrontMatter(p))

  const abstract = extractAbstractBlock(dedupedText)

  const findMultipleSentences = (keywords: string[], count: number = 3) => {
    const sentences = dedupedText
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !looksLikeFrontMatter(s))
    
    const scored = sentences.map(s => {
      const lower = s.toLowerCase()
      const score = keywords.filter(k => lower.includes(k)).length
      return { sentence: s, score }
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score)
    
    if (scored.length === 0) return 'Not mentioned'
    const result = scored.slice(0, count).map(item => item.sentence).join(' ')
    return result.slice(0, 600) || 'Not mentioned'
  }

  const formatResult = (result: string): string => formatAsBulletPoints(result, 3)

  return {
    background: formatResult(abstract || findMultipleSentences(['background', 'introduction', 'literature', 'context', 'motivation'], 3)),
    theory: formatResult(findMultipleSentences(['theory', 'theoretical', 'hypothesis', 'framework', 'model', 'approach'], 3)),
    methodology: formatResult(findMultipleSentences(['method', 'participants', 'procedure', 'design', 'sample', 'study'], 3)),
    measures: formatResult(findMultipleSentences(['measure', 'instrument', 'scale', 'assessment', 'questionnaire', 'metric'], 3)),
    results: formatResult(findMultipleSentences(['result', 'finding', 'analysis', 'significant', 'effect', 'accuracy', 'hypothesis', 'demonstrate'], 3)),
    implications: formatResult(findMultipleSentences(['implication', 'discussion', 'conclusion', 'contribution', 'practical', 'application', 'advance'], 3)),
    limitations: formatResult(findMultipleSentences(['limitation', 'future research', 'constraint', 'weakness', 'limitation', 'future work', 'challenge'], 3))
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

// Ensure all extracted values are formatted as bullet points
function ensureFormattedString(value: string): string {
  if (value === 'Not mentioned' || !value) return 'Not mentioned'
  
  // If already contains bullets, return as-is
  if (value.includes('•')) return value
  
  // Otherwise format as bullet points
  return formatAsBulletPoints(value, 3)
}

function mapParsedExtraction(
  parsed: Record<string, unknown>,
  customFields?: CustomFieldDefinition[]
): ExtractedData {
  const baseData = Object.fromEntries(
    BASE_FIELDS.map((field) => {
      const rawValue = ensureString(parsed[field])
      // Apply formatting to ensure bullet points
      const formattedValue = ensureFormattedString(rawValue)
      return [field, formattedValue]
    })
  ) as Record<BaseField, string>

  const extractedCustomFields = customFields?.length
    ? Object.fromEntries(
        customFields
          .map((field) => {
            const rawValue = ensureString(parsed[field.id])
            return [field.id, ensureFormattedString(rawValue)]
          })
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
