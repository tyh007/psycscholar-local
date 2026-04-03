// Dynamic import to avoid server-side rendering issues
let pdfjsLib: any = null

// Initialize PDF.js only in browser environment
async function initializePDFJS() {
  if (typeof window !== 'undefined' && !pdfjsLib) {
    try {
      console.log('Attempting to import pdfjs-dist...')
      const pdfjs = await import('pdfjs-dist')
      console.log('pdfjs-dist imported:', pdfjs)
      
      // Try different ways to access the PDF.js library
      pdfjsLib = pdfjs.default || pdfjs.pdfjsLib || pdfjs
      
      console.log('pdfjsLib after assignment:', pdfjsLib)
      
      if (!pdfjsLib) {
        throw new Error('PDF.js library not found in import')
      }
      
      // Configure worker
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
        console.log('PDF.js worker configured')
      } else {
        console.warn('PDF.js GlobalWorkerOptions not found')
      }
    } catch (error) {
      console.error('Failed to initialize PDF.js:', error)
      throw new Error('PDF.js initialization failed')
    }
  }
  return pdfjsLib
}

export interface PDFMetadata {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
  producer?: string
  creationDate?: Date
  modificationDate?: Date
}

export interface ExtractedPDFContent {
  metadata: PDFMetadata
  fullText: string
  pages: string[]
  abstract?: string
  extractedReferences: string[]
}

interface PDFTextItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

interface TitleExtractionResult {
  title?: string
  endIndex: number
}

export class PDFProcessor {
  private static instance: PDFProcessor

  static getInstance(): PDFProcessor {
    if (!PDFProcessor.instance) {
      PDFProcessor.instance = new PDFProcessor()
    }
    return PDFProcessor.instance
  }

  static async extractPDFContent(file: File): Promise<ExtractedPDFContent> {
    console.log('Starting PDF extraction for:', file.name)
    
    try {
      await initializePDFJS()
      
      if (!pdfjsLib) {
        throw new Error('PDF.js not initialized')
      }

      console.log('PDF.js initialized successfully')

      const arrayBuffer = await file.arrayBuffer()
      console.log('File converted to array buffer:', arrayBuffer.byteLength, 'bytes')

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      console.log('PDF loaded successfully, pages:', pdf.numPages)

      // Extract metadata
      const metadata = await this.extractMetadata(pdf)

      // Extract all pages
      const pages = await this.extractAllPages(pdf)

      // Combine full text
      const fullText = pages.join('\n\n')

      // Extract abstract
      const abstract = this.extractAbstract(fullText)

      // Extract references
      const extractedReferences = this.extractReferences(fullText)

      console.log('PDF extraction completed successfully')

      return {
        metadata,
        fullText,
        pages,
        abstract,
        extractedReferences
      }
    } catch (error) {
      console.error('PDF extraction error:', error)
      throw new Error(`Failed to extract PDF content: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private static async extractMetadata(pdf: any): Promise<PDFMetadata> {
    try {
      const info = await pdf.getMetadata()
      const metadata: PDFMetadata = {
        title: info.info?.Title,
        author: info.info?.Author,
        subject: info.info?.Subject,
        keywords: info.info?.Keywords,
        creator: info.info?.Creator,
        producer: info.info?.Producer,
        creationDate: info.info?.CreationDate ? new Date(info.info.CreationDate) : undefined,
        modificationDate: info.info?.ModDate ? new Date(info.info.ModDate) : undefined
      }
      return metadata
    } catch (error) {
      console.warn('Failed to extract PDF metadata:', error)
      return {}
    }
  }

  private static async extractAllPages(pdf: any): Promise<string[]> {
    const pages: string[] = []
    const numPages = pdf.numPages

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        const pageText = this.textContentToString(textContent.items as PDFTextItem[])
        pages.push(pageText)
      } catch (error) {
        console.warn(`Failed to extract page ${pageNum}:`, error)
        pages.push(`[Page ${pageNum} extraction failed]`)
      }
    }

    return pages
  }

  private static textContentToString(items: PDFTextItem[]): string {
    const positionedItems = items
      .filter((item): item is PDFTextItem & { str: string; transform: number[] } => {
        return Boolean(item.str?.trim()) && Array.isArray(item.transform) && item.transform.length >= 6
      })
      .map(item => ({
        text: item.str!.trim(),
        x: item.transform![4],
        y: item.transform![5]
      }))

    if (positionedItems.length === 0) {
      return items
        .filter(item => item.str?.trim())
        .map(item => item.str!.trim())
        .join(' ')
    }

    positionedItems.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2) return b.y - a.y
      return a.x - b.x
    })

    const lines: Array<{ y: number; items: typeof positionedItems }> = []

    for (const item of positionedItems) {
      const existingLine = lines.find(line => Math.abs(line.y - item.y) <= 2)
      if (existingLine) {
        existingLine.items.push(item)
      } else {
        lines.push({ y: item.y, items: [item] })
      }
    }

    lines.sort((a, b) => b.y - a.y)

    return lines
      .map(line =>
        line.items
          .sort((a, b) => a.x - b.x)
          .map(item => item.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(Boolean)
      .join('\n')
  }

  private static extractAbstract(fullText: string): string | undefined {
    // Look for abstract section
    const abstractPatterns = [
      /abstract\s*[:\-]?\s*\n?(.*?)(?=\n\s*(?:introduction|keywords|1\.|i\.|background|method))/is,
      /abstract\s*[:\-]?\s*\n?(.*?)(?=\n\s*[A-Z])/is,
      /ABSTRACT\s*[:\-]?\s*\n?(.*?)(?=\n\s*(?:INTRODUCTION|KEYWORDS|1\.|I\.|BACKGROUND|METHOD))/is
    ]

    for (const pattern of abstractPatterns) {
      const match = fullText.match(pattern)
      if (match && match[1]) {
        return match[1].trim().replace(/\s+/g, ' ')
      }
    }

    return undefined
  }

  private static extractReferences(fullText: string): string[] {
    const references: string[] = []
    
    // Look for references section
    const referencePatterns = [
      /references\s*\n?(.*?)(?=\n\s*(?:appendix|tables|figures)|$)/is,
      /bibliography\s*\n?(.*?)(?=\n\s*(?:appendix|tables|figures)|$)/is,
      /REFERENCES\s*\n?(.*?)(?=\n\s*(?:APPENDIX|TABLES|FIGURES)|$)/is
    ]

    let referenceText = ''
    for (const pattern of referencePatterns) {
      const match = fullText.match(pattern)
      if (match && match[1]) {
        referenceText = match[1]
        break
      }
    }

    if (referenceText) {
      // Extract individual references
      const refMatches = referenceText.match(/\d+\.\s*.*?(?=\n\s*\d+\.|\n\s*[A-Z]|\n\s*$)/gs)
      if (refMatches) {
        references.push(...refMatches.map(ref => ref.trim()))
      }
    }

    return references
  }

  static extractBibliographicInfo(fullText: string, metadata: PDFMetadata): {
    title?: string
    authors?: string
    year?: number
    journal?: string
    doi?: string
  } {
    const result: {
      title?: string
      authors?: string
      year?: number
      journal?: string
      doi?: string
    } = {}
    const firstPageText = fullText.split(/\n\n+/)[0] || ''
    const frontMatter = fullText.substring(0, 3000)
    const normalizedFrontMatter = this.normalizePDFText(frontMatter)
    const firstPageLines = firstPageText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    // Use metadata if available
    if (metadata.title) result.title = metadata.title
    if (metadata.author) {
      const metadataAuthors = this.extractAuthorNames(metadata.author)
      if (metadataAuthors.length > 0) {
        result.authors = metadataAuthors.join('; ')
      }
    }

    // Extract title from text if not in metadata
    if (!result.title) {
      const titleInfo = this.extractTitleFromLines(firstPageLines)
      if (titleInfo.title) {
        result.title = titleInfo.title
      } else {
        const titlePatterns = [
          /^(.*?)(?=\n\s*(?:abstract|introduction|keywords|1\.|i\.))/im,
          /^(.*?)(?=\n\s*[A-Z][a-z].*\n)/im
        ]

        for (const pattern of titlePatterns) {
          const match = fullText.match(pattern)
          if (match && match[1]) {
            result.title = match[1].trim()
            break
          }
        }
      }
    }

    // Extract authors
    if (!result.authors) {
      const titleInfo = this.extractTitleFromLines(firstPageLines)
      const authorsFromLines = this.extractAuthorsFromLines(
        firstPageLines,
        titleInfo.endIndex
      )

      if (authorsFromLines) {
        result.authors = authorsFromLines
      }
    }

    if (!result.authors) {
      const titleAnchoredAuthors = this.extractAuthorsNearTitle(
        normalizedFrontMatter,
        result.title ? this.normalizePDFText(result.title) : undefined
      )

      if (titleAnchoredAuthors) {
        result.authors = titleAnchoredAuthors
      }
    }

    if (!result.authors) {
      const authorPatterns = [
        /(?:by\s+)?([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}(?:\s*,\s*[A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3})*(?:\s+and\s+[A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3})?)/,
        /([A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}\s*(?:,\s*[A-Z][A-Za-z'`-]+(?:\s+[A-Z][A-Za-z'`.-]+){1,3}\s*){0,5})/
      ]

      for (const pattern of authorPatterns) {
        const match = this.normalizePDFText(firstPageText).match(pattern) || normalizedFrontMatter.match(pattern)
        if (match && match[1]) {
          const authorNames = this.extractAuthorNames(match[1])
          if (authorNames.length > 0) {
            result.authors = authorNames.join('; ')
            break
          }
        }
      }
    }

    // Extract year
    const yearMatches = frontMatter.match(/\b(?:19|20)\d{2}\b/g) || []
    const validYears = yearMatches
      .map(year => parseInt(year, 10))
      .filter(year => year >= 1950 && year <= new Date().getFullYear() + 1)

    if (validYears.length > 0) {
      result.year = Math.max(...validYears)
    } else if (metadata.creationDate) {
      result.year = metadata.creationDate.getFullYear()
    }

    // Extract journal
    const journalPatterns = [
      /journal of\s+([A-Z][a-z\s]+)/i,
      /([A-Z][a-z\s]+journal)/i,
      /published in\s+([A-Z][a-z\s]+)/i
    ]

    for (const pattern of journalPatterns) {
      const match = fullText.match(pattern)
      if (match && match[1]) {
        result.journal = match[1].trim()
        break
      }
    }

    // Extract DOI
    const doiMatch = fullText.match(/doi:\s*(10\.\d+\/[^\s]+)/i)
    if (doiMatch) {
      result.doi = doiMatch[1]
    }

    return result
  }

  private static extractTitleFromLines(lines: string[]): TitleExtractionResult {
    const titleLines: string[] = []
    let endIndex = -1

    for (const [index, line] of lines.slice(0, 8).entries()) {
      const normalized = this.normalizePDFText(line)
      const lower = normalized.toLowerCase()

      if (!normalized) continue
      if (this.looksLikeAuthorLine(normalized)) break
      if (/(abstract|introduction|keywords|decision research|university|department)/i.test(lower)) break
      if (normalized.length < 12) continue

      titleLines.push(normalized)
      endIndex = index

      if (
        normalized.endsWith('?') ||
        normalized.endsWith(':') ||
        normalized.length > 80 ||
        titleLines.length >= 3
      ) {
        break
      }
    }

    return {
      title: titleLines.length > 0 ? titleLines.join(' ').trim() : undefined,
      endIndex
    }
  }

  private static extractAuthorsFromLines(lines: string[], titleEndIndex: number): string | undefined {
    const startIndex = Math.max(0, titleEndIndex + 1)

    for (const line of lines.slice(startIndex, startIndex + 6)) {
      const normalized = this.normalizePDFText(line)
      if (!normalized) continue
      if (/(abstract|decision research|university|department|school|college|institute|journal|doi)/i.test(normalized)) {
        break
      }
      if (this.looksLikeAuthorLine(normalized)) {
        const authorNames = this.extractAuthorNames(normalized)
        if (authorNames.length > 0) {
          return authorNames.join('; ')
        }
      }
    }

    return undefined
  }

  private static extractAuthorsNearTitle(frontMatter: string, title?: string): string | undefined {
    let searchArea = frontMatter

    if (title) {
      const titleIndex = frontMatter.toLowerCase().indexOf(title.toLowerCase())
      if (titleIndex >= 0) {
        searchArea = frontMatter.slice(titleIndex + title.length, titleIndex + title.length + 800)
      }
    }

    searchArea = searchArea
      .replace(/\babstract\b[\s\S]*$/i, ' ')
      .replace(/\bdoi\b[\s\S]*$/i, ' ')
      .replace(
        /\b(?:university|department|faculty|school|college|research|institute|hospital|journal|received|accepted|published)\b[\s\S]*$/i,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim()

    const authorNames = this.extractAuthorNames(searchArea)
    if (authorNames.length > 0) {
      return authorNames.join('; ')
    }

    return undefined
  }

  private static extractAuthorNames(value: string): string[] {
    const truncated = this.normalizePDFText(value)
      .replace(
        /\b(?:decision research|university|department|faculty|school|college|research|institute|hospital|journal|received|accepted|published|abstract|doi)\b[\s\S]*$/i,
        ' '
      )
      .replace(/\s+/g, ' ')
      .trim()

    const cleaned = truncated
      .replace(/\d+(?:,\d+)*/g, ' ')
      .replace(/[*†‡§¶]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')

    const authorLine = cleaned
      .replace(/\s*&\s*/g, ', ')
      .replace(/\s+and\s+/gi, ', ')

    const segments = authorLine
      .split(',')
      .map(segment => segment.trim())
      .filter(Boolean)

    return segments
      .map(segment => this.normalizeAuthorSegment(segment))
      .filter((name): name is string => Boolean(name))
      .filter((name, index, array) => array.indexOf(name) === index)
  }

  private static normalizeAuthorSegment(segment: string): string | undefined {
    const cleaned = this.cleanAuthorString(segment)
    if (!cleaned) return undefined

    let parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      const expanded = this.expandCompactAuthor(parts[0])
      if (expanded) {
        parts = expanded.split(/\s+/).filter(Boolean)
      }
    }

    if (parts.length < 2) return undefined

    const firstName = parts[0]
    const surnameParts = parts.slice(1)

    const mergedSurname = surnameParts.join('')
    const normalizedName = `${firstName} ${mergedSurname}`.trim()

    return this.isPlausibleAuthorName(normalizedName) ? normalizedName : undefined
  }

  private static expandCompactAuthor(value: string): string | undefined {
    const match = value.match(/^([A-Z][a-z]+)((?:Mc|Mac|O')[A-Z].+|[A-Z][a-zA-Z]+)$/)
    if (!match) return undefined
    return `${match[1]} ${match[2]}`
  }

  private static cleanAuthorString(value: string): string {
    return value
      .replace(/[¨´`^~]+/g, '')
      .replace(/\s*\d+(?:,\d+)*\s*/g, ' ')
      .replace(/[*†‡§¶]+/g, ' ')
      .replace(/\b(?:and)\b/gi, ', ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s+,/g, ',')
      .replace(/,{2,}/g, ',')
      .replace(/,\s*$/, '')
  }

  private static isPlausibleAuthorString(value: string): boolean {
    const normalized = value.trim()
    if (!normalized) return false
    if (normalized.length < 5 || normalized.length > 120) return false

    const lower = normalized.toLowerCase()
    const blockedTerms = [
      'university',
      'department',
      'journal',
      'abstract',
      'introduction',
      'college',
      'school',
      'www.',
      '@'
    ]

    if (blockedTerms.some(term => lower.includes(term))) return false

    const words = normalized.split(/\s+/)
    if (words.length < 2) return false

    const segments = normalized.split(/\s*,\s*/).filter(Boolean)
    if (segments.length === 1 && words.length < 2) return false

    const capitalizedWords = words.filter(word => /^[A-Z][A-Za-z'`.-]*$/.test(word))
    return capitalizedWords.length >= 2
  }

  private static isPlausibleAuthorName(value: string): boolean {
    const normalized = value.trim()
    if (!normalized) return false

    const parts = normalized.split(/\s+/).filter(Boolean)
    if (parts.length !== 2) return false

    const lower = normalized.toLowerCase()
    if (/(research|university|department|school|journal|study|charity|child|need)/.test(lower)) {
      return false
    }

    return parts.every(part => /^[A-Z][A-Za-z'’.-]{1,}$/.test(part))
  }

  private static looksLikeAuthorLine(value: string): boolean {
    if (!value) return false
    if (value.includes(':')) return false

    const lower = value.toLowerCase()
    if (/(abstract|introduction|background|method|results|discussion)/.test(lower)) {
      return false
    }

    const hasAuthorSeparators = /,|\band\b|\d/.test(value)
    const hasNameLikePattern = /[A-Z][A-Za-z'`.-]+\s+[A-Z][A-Za-z'`.-]+/.test(value)

    return hasAuthorSeparators && hasNameLikePattern
  }

  private static normalizePDFText(value: string): string {
    return value
      .replace(/[¨´`^~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  static validatePDFFile(file: File): { valid: boolean; error?: string } {
    if (file.type !== 'application/pdf') {
      return { valid: false, error: 'Invalid file type. Only PDF files are allowed.' }
    }
    if (file.size > 50 * 1024 * 1024) {
      return { valid: false, error: 'File size exceeds 50MB limit.' }
    }
    return { valid: true }
  }

  static getEstimatedProcessingTime(fileSize: number): number {
    // Estimate processing time based on file size (bytes to seconds)
    // Rough estimate: 1MB takes about 2-3 seconds to process
    const sizeInMB = fileSize / (1024 * 1024)
    return Math.max(5, Math.ceil(sizeInMB * 2.5))
  }
}

// Export singleton instance for backward compatibility
export const pdfProcessor = {
  extractPDFContent: PDFProcessor.extractPDFContent.bind(PDFProcessor),
  validatePDFFile: PDFProcessor.validatePDFFile.bind(PDFProcessor),
  extractBibliographicInfo: PDFProcessor.extractBibliographicInfo.bind(PDFProcessor),
  getEstimatedProcessingTime: PDFProcessor.getEstimatedProcessingTime.bind(PDFProcessor)
}
