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
    headings: ['abstract', 'introduction', 'background', 'related work', 'literature review', 'literature'],
    keywords: ['background', 'introduction', 'motivation', 'problem', 'context', 'related work', 'literature', 'prior work']
  },
  {
    key: 'theory',
    headings: ['theory', 'theoretical framework', 'conceptual framework', 'hypotheses', 'literature review', 'conceptual background', 'theoretical background', 'framework'],
    keywords: ['theory', 'framework', 'hypothesis', 'mechanism', 'conceptual', 'theoretical', 'model', 'proposition']
  },
  {
    key: 'methodology',
    headings: ['method', 'methods', 'methodology', 'participants', 'procedure', 'study design', 'research design', 'experimental design', 'approach'],
    keywords: ['method', 'methods', 'methodology', 'participants', 'procedure', 'design', 'experiment', 'study', 'approach', 'participants']
  },
  {
    key: 'measures',
    headings: ['measures', 'materials', 'instruments', 'materials and methods', 'data collection', 'measurement', 'apparatus', 'tools'],
    keywords: ['measure', 'measures', 'instrument', 'scale', 'questionnaire', 'survey', 'assessment', 'operationali', 'apparatus', 'tool']
  },
  {
    key: 'results',
    headings: ['results', 'findings', 'analysis', 'findings and results', 'outcomes'],
    keywords: ['result', 'results', 'findings', 'analysis', 'significant', 'effect', 'accuracy', 'outcome', 'correlation']
  },
  {
    key: 'implications',
    headings: ['discussion', 'conclusion', 'implications', 'conclusions', 'discussion and implications'],
    keywords: ['discussion', 'conclusion', 'implication', 'implications', 'contribution', 'practical', 'theoretical contribution', 'significance']
  },
  {
    key: 'limitations',
    headings: ['limitations', 'future work', 'future research', 'limitation'],
    keywords: ['limitation', 'limitations', 'future work', 'future research', 'constraint', 'constraint', 'generalizability', 'limitation']
  }
]

function getClient(settings: OllamaSettings = readOllamaSettings()) {
  return new OllamaClient(settings.baseUrl, settings.model)
}

function truncatePaperText(text: string, maxLength: number = 16000) {
  // Increased from 12000 to preserve more critical information
  if (text.length <= maxLength) return text
  // Try to truncate at paragraph boundary
  const truncated = text.slice(0, maxLength)
  const lastParagraph = truncated.lastIndexOf('\n\n')
  return lastParagraph > maxLength * 0.85 ? truncated.slice(0, lastParagraph) : truncated
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Not mentioned'
}

// Ensure all extracted values are formatted as bullet points
function ensureFormattedString(value: string): string {
  if (value === 'Not mentioned' || !value) return 'Not mentioned'
  
  // Normalize all bullet formats to •
  let normalized = value
    .replace(/^[-–•]\s*/gm, '• ')  // Replace all bullet types with •
    .replace(/\n\n+/g, '\n')       // Remove extra blank lines
    .trim()
  
  // If already contains bullets, keep as-is
  if (normalized.includes('•')) return normalized
  
  // Otherwise format as bullet points
  return formatAsBulletPoints(value, 3)
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
    .map(([key, value]) => [key, ensureFormattedString(String(value).trim())])
    .filter(([, value]) => value !== 'Not mentioned')

  return {
    background: ensureFormattedString(readString(parsed.background)),
    theory: ensureFormattedString(readString(parsed.theory)),
    methodology: ensureFormattedString(readString(parsed.methodology)),
    measures: ensureFormattedString(readString(parsed.measures)),
    results: ensureFormattedString(readString(parsed.results)),
    implications: ensureFormattedString(readString(parsed.implications)),
    limitations: ensureFormattedString(readString(parsed.limitations)),
    customFields: customEntries.length > 0 ? Object.fromEntries(customEntries) : undefined
  }
}

const TEMPLATE_PHRASES = [
  // Exact prompt copies that indicate the LLM just echoed the task
  'research context, problem statement',
  'theoretical framework and specific hypotheses',
  'research design, sample characteristics',
  'all scales, instruments, and measurement tools',
  'main findings, statistical results',
  'theoretical and practical contributions',
  'study limitations acknowledged by authors',
  // Low-signal responses
  'not explicitly stated',
  'not clearly specified',
  'not provided in the text',
  'not mentioned in the paper',
  'information not available',
  'not specified in the paper',
  'unclear from the text',
  'not stated in the paper'
]

function looksLikeTemplateOutput(text: string): boolean {
  // Don't just check if phrase exists - check if text is ESSENTIALLY just the prompt
  const lower = text.toLowerCase()
  
  // If text is too short (less than 40 chars), it's likely template or placeholder
  if (text.length < 40) return true
  
  // Check for exact template matches that indicate the LLM just echoed the prompt
  const exactTemplateMatches = TEMPLATE_PHRASES.filter(phrase => lower === phrase.toLowerCase()).length
  if (exactTemplateMatches > 0) return true
  
  // If the text contains template phrases AND is very short (< 80 chars), flag it
  if (text.length < 80 && TEMPLATE_PHRASES.some(phrase => lower.includes(phrase))) {
    return true
  }
  
  return false
}

function validateExtractedData(extracted: ExtractedData) {
  const values = [
    extracted.background,
    extracted.theory,
    extracted.methodology,
    extracted.measures,
    extracted.results,
    extracted.implications,
    extracted.limitations
  ]

  // Count how many meaningful fields we have
  const meaningfulCount = values.filter(value => 
    value && value !== 'Not mentioned' && !looksLikeTemplateOutput(value)
  ).length
  
  // More lenient validation:
  // - Require at least 1 meaningful extraction (was 2)
  // - Check for at least some content even if not all fields have data
  const uniqueCount = new Set(
    values
      .filter(value => value && value !== 'Not mentioned')
      .map(value => value.toLowerCase())
  ).size

  // Allow extraction if:
  // 1. We have at least 1 meaningful field (more lenient than before), OR
  // 2. We have multiple different field values even if some are short
  const hasMinimalContent = meaningfulCount >= 1
  const hasMultipleFields = uniqueCount >= 2
  
  const isValid = hasMinimalContent || hasMultipleFields
  
  // Debug logging
  if (!isValid) {
    console.warn('Extraction validation failed:', {
      meaningfulCount,
      uniqueCount,
      fields: {
        background: extracted.background?.slice(0, 30) || 'N/A',
        theory: extracted.theory?.slice(0, 30) || 'N/A',
        methodology: extracted.methodology?.slice(0, 30) || 'N/A',
        measures: extracted.measures?.slice(0, 30) || 'N/A',
        results: extracted.results?.slice(0, 30) || 'N/A',
        implications: extracted.implications?.slice(0, 30) || 'N/A',
        limitations: extracted.limitations?.slice(0, 30) || 'N/A'
      }
    })
  }
  
  return isValid
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanAndNormalizeText(text: string): string {
  return text
    // Remove journal headers/footers (e.g., "INTERNATIONAL JOURNAL OF HUMAN–COMPUTER INT")
    .replace(/[A-Z][A-Z\s–\-]{30,}(?=\n|$)/g, '')
    // Fix hyphenated words broken across lines (e.g., "litera-ture" → "literature")
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
    // Remove KEYWORDS and similar metadata sections
    .replace(/\bKEYWORDS\b.*?(?=\n\n|\n[A-Z]|$)/is, '')
    // Remove ABSTRACT header variations
    .replace(/\bABSTRACT\b\s*[:\-]?\s*/i, '')
    // Remove author email and institution affiliation lines
    .replace(/^.*?@.*?$\n/gm, '')
    // Remove common institution/affiliation lines
    .replace(/^.*?(?:University|Department|School|College|Institute|Laboratory).*?$\n/gm, '')
    // Fix hyphenation in middle of paragraphs
    .replace(/(\w+)-(?=\n)/g, '$1')
    // Fix line breaks that split sentences (e.g., convert "\n" mid-sentence to space)
    .replace(/([a-z])\n+([a-z])/g, '$1 $2')
    // Remove repeated whitespace and normalize
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim()
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
      if (bucket && bucket.join(' ').length < 4000) {  // Increased from 2500 to 4000 to capture more section content
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

  // Collect sentences until we reach count or maxChars
  let result = ''
  for (let i = 0; i < Math.min(count, sentences.length); i++) {
    const sentence = sentences[i]
    if ((result + sentence).length <= maxChars) {
      result += (result ? ' ' : '') + sentence
    } else if (result) {
      break
    } else {
      // If single sentence exceeds maxChars, still include it truncated
      result = sentence.slice(0, maxChars)
      break
    }
  }
  
  return result || normalizeWhitespace(text).slice(0, maxChars)
}

function getSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => normalizeWhitespace(sentence))
    .filter(sentence => sentence.length > 20)
    .filter(sentence => !isNoiseLine(sentence))
    .filter(sentence => !/^(copyright|permission to make|references)\b/i.test(sentence))
}

function scoreSentence(sentence: string, keywords: string[]) {
  const lower = sentence.toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += 1
  }
  if (/\bwe (propose|conduct|test|examine|investigate|evaluate|show|find)\b/.test(lower)) score += 0.5
  if (/\bparticipants?\b|\bsample\b|\bexperiment\b|\bstudy\b/.test(lower)) score += 0.5
  if (/\bresults?\b|\bfindings?\b|\bsignificant\b|\bimproved?\b/.test(lower)) score += 0.5
  return score
}

function pickSentencesByKeywords(text: string, keywords: string[], count: number, maxChars: number) {
  const sentences = getSentences(text)
    .map(sentence => ({ sentence, score: scoreSentence(sentence, keywords) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (sentences.length === 0) return undefined

  const picked: string[] = []
  const seenNormalized = new Set<string>()
  
  for (const item of sentences) {
    // Check for exact duplicates
    const normalized = item.sentence.toLowerCase()
    if (!seenNormalized.has(normalized) && !picked.includes(item.sentence)) {
      seenNormalized.add(normalized)
      picked.push(item.sentence)
    }
    if (picked.length >= count) break
  }

  const result = picked.join(' ').slice(0, maxChars)
  return result.length > 0 ? result : undefined
}

function seemsLikeLimitation(text: string) {
  const lower = text.toLowerCase()
  return /\b(limitation|limitations|future work|future research|constraint|caution|generalizability)\b/.test(lower)
}

function dedupeField(value: string, usedValues: Set<string>) {
  const normalized = value.toLowerCase()
  if (usedValues.has(normalized)) return 'Not mentioned'
  usedValues.add(normalized)
  return value
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
    // Increased from 4 to 6 sentences, 700 to 1000 chars
    parts.push(`Abstract: ${takeSentences(context.abstract, 6, 1000)}`)
  } else {
    const extractedAbstract = extractAbstractBlock(text)
    if (extractedAbstract) {
      parts.push(`Abstract: ${takeSentences(extractedAbstract, 6, 1000)}`)
    }
  }

  for (const config of SECTION_FIELD_CONFIG) {
    let candidate = ''

    // Try to find the section by headings first
    for (const heading of config.headings) {
      const block = sections.get(heading)
      if (block && block.length > 0) {
        candidate = block.join(' ')
        break
      }
    }

    // If not found by headings, search by keywords
    if (!candidate) {
      candidate = findKeywordParagraph(text, config.keywords) || ''
    }

    // If still not found, try to pick sentences by relevance - increased from 5 to 8 sentences and 1000 to 1500 chars
    if (!candidate) {
      candidate = pickSentencesByKeywords(text, config.keywords, 8, 1500) || ''
    }

    if (candidate) {
      // Increased from 4 sentences to 8, and from 700 to 1200 chars per field
      parts.push(`${config.key.toUpperCase()}: ${takeSentences(candidate, 8, 1200)}`)
    }
  }

  if (parts.length === 0) {
    parts.push(stripTrailingNoise(text).slice(0, 6000))
  }

  // Increased from 6000 to 10000 for better context
  return parts.join('\n\n').slice(0, 10000)
}

function tryLooseFieldExtraction(raw: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {}

  for (const config of SECTION_FIELD_CONFIG) {
    const pattern = new RegExp(`"${config.key}"\\s*:\\s*"([\\s\\S]*?)"(?:\\s*,\\s*"|\\s*\\})`, 'i')
    const match = raw.match(pattern)
    if (match?.[1]) {
      result[config.key] = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')  // Preserve newlines instead of replacing with space
        .replace(/  +/g, ' ')   // Only remove multiple spaces, not newlines
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

// Format text into bullet points with better deduplication
function formatAsBulletPoints(text: string, maxBullets: number = 3): string {
  if (!text || text === 'Not mentioned') return 'Not mentioned'
  
  // First, check if text already has line breaks (newlines) - treat each line as a bullet
  const lines = text.split('\n').filter(line => line.trim().length > 0)
  
  // If we have multiple lines, treat them as existing content structure
  if (lines.length > 1) {
    const seen = new Set<string>()
    const unique: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      // Remove existing bullet markers if present
      const cleaned = trimmed.replace(/^[-–•]\s*/, '')
      const normalized = cleaned.toLowerCase()
      
      if (!seen.has(normalized) && cleaned.length > 0) {
        seen.add(normalized)
        unique.push(`• ${cleaned}`)
      }
    }
    
    if (unique.length > 0) {
      return unique.slice(0, maxBullets).join('\n')
    }
  }
  
  // If no line breaks, split into sentences and format as bullet points
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => {
      // Minimum length 20 chars (relaxed from 30)
      if (s.length < 20) return false
      // Filter out common artifacts - be more selective
      if (/^(fig|table|ref|page|www|http|copyright|permission to make|keywords|see|caption)/i.test(s)) return false
      // Filter incomplete sentences
      if (s.endsWith('...') || s.endsWith('–') || s.endsWith('-')) return false
      // Filter sentences with incomplete markers or fragments
      if (/\w+-\s*$/.test(s)) return false
      return true
    })
  
  if (sentences.length === 0) return 'Not mentioned'
  
  // Additional filtering for quality - more lenient
  const qualitySentences = sentences.filter(s => {
    // Ensure sentence has reasonable content (5+ words instead of 8)
    const words = s.split(/\s+/)
    if (words.length < 5) return false
    // Only filter obvious meta-text
    if (/^(and they|however,|further|additionally)\s+/i.test(s)) return false
    // Avoid sentence fragments
    if (/\s\w+$|\w+\s*$/.test(s) && !/[.!?]$/.test(s)) return false
    return true
  })
  
  if (qualitySentences.length === 0) return 'Not mentioned'
  
  // Deduplicate sentences
  const seenSentences = new Set<string>()
  const uniqueSentences: string[] = []
  
  for (const sentence of qualitySentences) {
    const normalized = sentence.toLowerCase()
    if (!seenSentences.has(normalized)) {
      seenSentences.add(normalized)
      uniqueSentences.push(sentence)
    }
  }
  
  if (uniqueSentences.length === 0) return 'Not mentioned'
  
  // Format as bullet points - each on its own line
  const bullets = uniqueSentences.slice(0, maxBullets)
    .map(s => `• ${s}`)
    .join('\n')
  
  return bullets || 'Not mentioned'
}

export function extractPaperWithRules(text: string): ExtractedData {
  // Clean PDF artifacts before processing
  const cleanedText = cleanAndNormalizeText(text)
  const sections = collectSectionBlocks(cleanedText)
  const abstract = extractAbstractBlock(cleanedText)
  const referenceSafeText = stripTrailingNoise(cleanedText)
  const output = {} as Record<SectionField, string>
  const usedValues = new Set<string>()

  for (const config of SECTION_FIELD_CONFIG) {
    let candidate = ''

    // First, try to find by section headings
    for (const heading of config.headings) {
      const block = sections.get(heading)
      if (block && block.length > 0) {
        candidate = block.join(' ')
        break
      }
    }

    // For background, use abstract as early fallback
    if (!candidate && config.key === 'background' && abstract) {
      candidate = abstract
    }

    // Second, try keyword paragraph matching
    if (!candidate) {
      candidate = findKeywordParagraph(referenceSafeText, config.keywords) || ''
    }

    // Third, try to pick sentences by keyword relevance
    if (!candidate) {
      candidate = pickSentencesByKeywords(referenceSafeText, config.keywords, 3, 500) || ''
    }

    // Increased char limit from 420 to 500 for better extraction
    let finalValue = candidate ? takeSentences(candidate, 3, 500) : 'Not mentioned'

    if (config.key === 'limitations' && finalValue !== 'Not mentioned' && !seemsLikeLimitation(finalValue)) {
      finalValue = 'Not mentioned'
    }

    if (config.key === 'implications' && finalValue !== 'Not mentioned') {
      const lower = finalValue.toLowerCase()
      if (!/\b(implication|implications|suggest|contribution|practical|application|useful|improve)\b/.test(lower)) {
        finalValue = 'Not mentioned'
      }
    }

    // Format as bullet points for better presentation
    const formattedValue = finalValue === 'Not mentioned' 
      ? finalValue 
      : formatAsBulletPoints(dedupeField(finalValue, usedValues), 3)
    
    output[config.key] = formattedValue
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
      max_tokens: 2000  // Increased from 1400 to give LLM more space for 7 fields
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
  try {
    const prompt = PromptBuilder.buildExtractionPrompt(
      buildFocusedPaperContext(truncatePaperText(paperText), context),
      detailLevel,
      customFields
    )
    const result = await chatForJson(prompt.systemPrompt, prompt.userPrompt, model)
    const extractedData = parseExtractionResponse(result.parsed)

    if (!validateExtractedData(extractedData)) {
      // Log detailed information about what was extracted for debugging
      console.warn('Ollama extraction validation failed. Attempting rule-based fallback...', {
        modelUsed: result.model,
        extractedFieldCount: Object.values(extractedData).filter(v => v !== 'Not mentioned').length,
        extractedFields: {
          background: extractedData.background?.slice(0, 50),
          theory: extractedData.theory?.slice(0, 50),
          methodology: extractedData.methodology?.slice(0, 50),
          measures: extractedData.measures?.slice(0, 50),
          results: extractedData.results?.slice(0, 50),
          implications: extractedData.implications?.slice(0, 50),
          limitations: extractedData.limitations?.slice(0, 50)
        }
      })
      
      // Instead of throwing, fall back to rule-based extraction
      const ruleBasedData = extractPaperWithRules(paperText)
      
      console.log('Rule-based extraction used as fallback for Ollama validation failure')
      return {
        extractedData: ruleBasedData,
        model: `${result.model} (with rule-based fallback)`
      }
    }

    return {
      extractedData,
      model: result.model
    }
  } catch (error) {
    // If extraction fails completely, try rule-based extraction
    console.warn('Ollama extraction error, using rule-based fallback:', error instanceof Error ? error.message : String(error))
    const fallbackData = extractPaperWithRules(paperText)
    return {
      extractedData: fallbackData,
      model: 'rule-based extraction (error fallback)'
    }
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
