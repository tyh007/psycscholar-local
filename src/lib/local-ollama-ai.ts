import { type ExtractedData } from '@/lib/database'
import { OllamaClient } from '@/lib/ollama-client'
import { readOllamaSettings, type OllamaSettings } from '@/lib/ollama-settings'
import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'

type StructuredExtraction = {
  extractedData: ExtractedData
  model: string
}

function getClient(settings: OllamaSettings = readOllamaSettings()) {
  return new OllamaClient(settings.baseUrl, settings.model)
}

function truncatePaperText(text: string, maxLength: number = 12000) {
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Not mentioned'
}

function parseExtractionResponse(parsed: Record<string, unknown>): ExtractedData {
  const reserved = new Set([
    'background',
    'theory',
    'methodology',
    'measures',
    'results',
    'implications',
    'limitations'
  ])

  const customEntries = Object.entries(parsed)
    .filter(([key, value]) => !reserved.has(key) && typeof value === 'string')
    .map(([key, value]) => [key, String(value).trim()])

  return {
    background: readString(parsed.background),
    theory: readString(parsed.theory),
    methodology: readString(parsed.methodology),
    measures: readString(parsed.measures),
    results: readString(parsed.results),
    implications: readString(parsed.implications),
    limitations: readString(parsed.limitations),
    customFields: customEntries.length > 0 ? Object.fromEntries(customEntries) : undefined
  }
}

async function chatForJson(
  systemPrompt: string,
  userPrompt: string,
  model?: string
): Promise<{ parsed: Record<string, unknown>; model: string }> {
  const settings = readOllamaSettings()
  const resolvedModel = model || settings.model
  const client = getClient({ ...settings, model: resolvedModel })

  const response = await client.chat({
    model: resolvedModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false,
    options: {
      temperature: 0.1,
      max_tokens: 1400
    }
  })

  const cleaned = PromptBuilder.sanitizeResponse(response.message.content)
  const parsed = JSON.parse(cleaned) as Record<string, unknown>
  return {
    parsed,
    model: response.model || resolvedModel
  }
}

export async function getLocalOllamaAvailability() {
  const settings = readOllamaSettings()
  const client = getClient(settings)
  const models = await client.getAvailableModels()

  return {
    available: models.length > 0,
    models: models.map(model => model.name),
    currentBaseUrl: settings.baseUrl
  }
}

export async function extractPaperWithLocalOllama(
  paperText: string,
  detailLevel: 'brief' | 'detailed' = 'brief',
  customFields?: CustomFieldDefinition[],
  model?: string
): Promise<StructuredExtraction> {
  const prompt = PromptBuilder.buildExtractionPrompt(
    truncatePaperText(paperText),
    detailLevel,
    customFields
  )
  const result = await chatForJson(prompt.systemPrompt, prompt.userPrompt, model)
  return {
    extractedData: parseExtractionResponse(result.parsed),
    model: result.model
  }
}

export async function extractCustomFieldWithLocalOllama(
  paperText: string,
  customField: CustomFieldDefinition,
  detailLevel: 'brief' | 'detailed' = 'brief',
  model?: string
) {
  const settings = readOllamaSettings()
  const resolvedModel = model || settings.model
  const client = getClient({ ...settings, model: resolvedModel })
  const prompt = PromptBuilder.buildCustomFieldPrompt(
    truncatePaperText(paperText),
    customField,
    detailLevel
  )

  return client.generateText(prompt, resolvedModel, {
    temperature: 0.1,
    max_tokens: detailLevel === 'detailed' ? 700 : 300
  })
}

export async function reExtractFieldsWithLocalOllama(
  paperText: string,
  existingExtraction: ExtractedData,
  fieldsToUpdate: string[],
  detailLevel: 'brief' | 'detailed' = 'brief',
  model?: string
): Promise<StructuredExtraction> {
  const prompt = PromptBuilder.buildReExtractionPrompt(
    truncatePaperText(paperText),
    existingExtraction,
    fieldsToUpdate,
    detailLevel
  )
  const result = await chatForJson(prompt.systemPrompt, prompt.userPrompt, model)
  return {
    extractedData: parseExtractionResponse(result.parsed),
    model: result.model
  }
}

export async function performCrossPaperAnalysisWithLocalOllama(
  papers: Array<{
    title: string
    authors: string
    year: number
    extractedData: ExtractedData
  }>,
  analysisQuestion: string,
  model?: string
) {
  const settings = readOllamaSettings()
  const resolvedModel = model || settings.model
  const client = getClient({ ...settings, model: resolvedModel })
  const prompt = PromptBuilder.buildCrossPaperAnalysisPrompt(papers, analysisQuestion)

  return client.generateText(prompt, resolvedModel, {
    temperature: 0.2,
    max_tokens: 900
  })
}
