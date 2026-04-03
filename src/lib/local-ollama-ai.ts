import { type ExtractedData } from '@/lib/database'
import { OllamaClient } from '@/lib/ollama-client'
import { readOllamaSettings, type OllamaSettings } from '@/lib/ollama-settings'
import { PromptBuilder, type CustomFieldDefinition } from '@/lib/prompt-builder'

type StructuredExtraction = {
  extractedData: ExtractedData
  model: string
}

type SectionField = keyof Omit<ExtractedData, 'customFields'>

type ExtractionContext = {
  title?: string
  abstract?: string
}

const SECTION_FIELD_CONFIG: Array<{ key: SectionField; headings: string[]; keywords: string[] }> = [
  {
    key: 'background',
    headings: ['abstract', 'introduction', 'background', 'related work', 'literature review'],
    keywords: ['background', 'introduction', 'motivation', 'problem', 'context', 'related work', 'literature']
  },
  {
    key: 'theory',
    headings: ['theory', 'theoretical framework', 'conceptual framework', 'hypotheses'],
    keywords: ['theory', 'framework', 'hypothesis', 'mechanism', 'conceptual']
  },
  {
    key: 'methodology',
    headings: ['method', 'methods', 'methodology', 'participants', 'procedure', 'study design'],
    keywords: ['method', 'methods', 'methodology', 'participants', 'procedure', 'design', 'experiment', 'study']
  },
  {
    key: 'measures',
    headings: ['measures', 'materials', 'instruments'],
    keywords: ['measure', 'measures', 'instrument', 'scale', 'questionnaire', 'survey', 'assessment']
  },
  {
    key: 'results',
    headings: ['results', 'findings', 'analysis'],
    keywords: ['result', 'results', 'findings', 'analysis', 'significant', 'effect', 'accuracy']
  },
  {
    key: 'implications',
    headings: ['discussion', 'conclusion', 'implications'],
    keywords: ['discussion', 'conclusion', 'implication', 'implications', 'contribution', 'practical']
  },
  {
    key: 'limitations',
    headings: ['limitations', 'future work', 'future research'],
    keywords: ['limitation', 'limitations', 'future work', 'future research', 'constraint']
  }
]

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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripTrailingNoise(text: string) {
  return text
    .replace(/\breferences\b[\s\S]*$/i, ' ')
    .replace(/\bappendix\b[\s\S]*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanContentLine(line: string) {
  return normalizeWhitespace(line)
    .replace(/^\d+\s+/, '')
    .replace(/^[-•]\s+/, '')
}

function isNoiseLine(line: string) {
  const lower = line.toLowerCase()
  return (
    !line ||
    /@/.test(line) ||
    /^(figure|table)\s+\d+/i.test(line) ||
    /\b(?:chi|barcelona|spain|copyright|permission to make|acm|proceedings)\b/.test(lower) ||
    /\b(?:university|department|school|college|laboratory|institute)\b/.test(lower)
  )
}

function isLikelyHeading(line: string) {
  const lower = line.toLowerCase().replace(/[.:]/g, '').trim()
  if (!lower) return false
  if (lower.length > 60) return false
  return SECTION_FIELD_CONFIG.some(config => config.headings.includes(lower))
}

function splitIntoCleanLines(text: string) {
  return text
    .split('\n')
    .map(cleanContentLine)
    .filter(line => line.length > 0)
}

function collectSectionBlocks(text: string) {
  const trimmed = stripTrailingNoise(text)
  const lines = splitIntoCleanLines(trimmed)
  const sections = new Map<string, string[]>()
  let currentHeading: string | null = null

  for (const rawLine of lines) {
    if (isNoiseLine(rawLine)) continue
    const line = cleanContentLine(rawLine)
    if (!line) continue

    const lower = line.toLowerCase().replace(/[.:]/g, '').trim()

    if (isLikelyHeading(line)) {
      currentHeading = lower
      if (!sections.has(currentHeading)) {
        sections.set(currentHeading, [])
      }
      continue
    }

    if (currentHeading) {
      const bucket = sections.get(currentHeading)
      if (bucket && bucket.join(' ').length < 2500) {
        bucket.push(line)
      }
    }
  }

  return sections
}

function takeSentences(text: string, count: number, maxChars: number) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => normalizeWhitespace(sentence))
    .filter(sentence => sentence.length > 20 && !isNoiseLine(sentence))

  if (sentences.length === 0) {
    return normalizeWhitespace(text).slice(0, maxChars)
  }

  return sentences.join(' ').slice(0, maxChars).split(/(?<=[.!?])\s+/).slice(0, count).join(' ').slice(0, maxChars)
}

function findKeywordParagraph(text: string, keywords: string[]) {
  const paragraphs = text
    .split(/\n\n+/)
    .map(paragraph => normalizeWhitespace(paragraph))
    .filter(paragraph => paragraph.length > 80)
    .filter(paragraph => !looksLikeFrontMatter(paragraph))
    .filter(paragraph => !/^references\b/i.test(paragraph))

  for (const paragraph of paragraphs) {
    const lower = paragraph.toLowerCase()
    if (keywords.some(keyword => lower.includes(keyword)) && isUsableSectionParagraph(paragraph)) {
      return paragraph
    }
  }

  return undefined
}

function buildFocusedPaperContext(text: string, context?: ExtractionContext) {
  const sections = collectSectionBlocks(text)
  const parts: string[] = []

  if (context?.title) {
    parts.push(`Title: ${normalizeWhitespace(context.title)}`)
  }

  if (context?.abstract) {
    parts.push(`Abstract: ${takeSentences(context.abstract, 4, 700)}`)
  } else {
    const extractedAbstract = extractAbstractBlock(text)
    if (extractedAbstract) {
      parts.push(`Abstract: ${takeSentences(extractedAbstract, 4, 700)}`)
    }
  }

  for (const config of SECTION_FIELD_CONFIG) {
    let candidate = ''

    for (const heading of config.headings) {
      const block = sections.get(heading)
      if (block && block.length > 0) {
        candidate = block.join(' ')
        break
      }
    }

    if (!candidate) {
      candidate = findKeywordParagraph(text, config.keywords) || ''
    }

    if (candidate) {
      parts.push(`${config.key.toUpperCase()}: ${takeSentences(candidate, 4, 700)}`)
    }
  }

  if (parts.length === 0) {
    parts.push(stripTrailingNoise(text).slice(0, 4000))
  }

  return parts.join('\n\n').slice(0, 6000)
}

function tryLooseFieldExtraction(raw: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {}

  for (const config of SECTION_FIELD_CONFIG) {
    const pattern = new RegExp(`"${config.key}"\\s*:\\s*"([\\s\\S]*?)"(?:\\s*,\\s*"|\\s*\\})`, 'i')
    const match = raw.match(pattern)
    if (match?.[1]) {
      result[config.key] = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
  }

  return Object.keys(result).length >= 4 ? result : null
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
    /(university|department|school|college|received|accepted|published|copyright|permission to make)/.test(lower) ||
    /^[A-Z][A-Za-z .,&:-]{0,120}$/.test(paragraph)
  )
}

function isUsableSectionParagraph(paragraph: string) {
  const lower = paragraph.toLowerCase()
  if (/@/.test(paragraph)) return false
  if (/(university|department|school|college)/.test(lower)) return false
  if (paragraph.split(/\s+/).length < 18) return false
  return true
}

export function extractPaperWithRules(text: string): ExtractedData {
  const sections = collectSectionBlocks(text)
  const abstract = extractAbstractBlock(text)
  const output = {} as Record<SectionField, string>

  for (const config of SECTION_FIELD_CONFIG) {
    let candidate = ''

    for (const heading of config.headings) {
      const block = sections.get(heading)
      if (block && block.length > 0) {
        candidate = block.join(' ')
        break
      }
    }

    if (!candidate) {
      candidate = findKeywordParagraph(text, config.keywords) || ''
    }

    if (!candidate && config.key === 'background' && abstract) {
      candidate = abstract
    }

    output[config.key] = candidate ? takeSentences(candidate, 3, 420) : 'Not mentioned'
  }

  return output
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
    format: 'json',
    options: {
      temperature: 0.1,
      max_tokens: 1400
    }
  })

  const cleaned = PromptBuilder.sanitizeResponse(response.message.content)
  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch (error) {
    const loose = tryLooseFieldExtraction(cleaned)
    if (loose) {
      parsed = loose
      return {
        parsed,
        model: response.model || resolvedModel
      }
    }

    const preview = response.message.content.slice(0, 300)
    throw new Error(
      `Ollama returned non-JSON output. Preview: ${preview}${preview.length >= 300 ? '...' : ''}`
    )
  }

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
  model?: string,
  context?: ExtractionContext
): Promise<StructuredExtraction> {
  const prompt = PromptBuilder.buildExtractionPrompt(
    buildFocusedPaperContext(truncatePaperText(paperText), context),
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
