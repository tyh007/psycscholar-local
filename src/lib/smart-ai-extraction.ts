// 改进的本地 AI 提取服务 - 基于学术论文结构分析
import { type ExtractedData } from './database'

export interface SectionInfo {
  name: string
  keywords: string[]
  weight: number
}

export class SmartAIExtractionService {
  // 学术论文标准结构
  private sections: SectionInfo[] = [
    { name: 'background', keywords: ['introduction', 'background', 'overview', 'context', 'literature review', 'related work'], weight: 1.0 },
    { name: 'theory', keywords: ['theoretical framework', 'conceptual framework', 'theory', 'model', 'hypothesis'], weight: 1.0 },
    { name: 'methodology', keywords: ['method', 'methodology', 'approach', 'procedure', 'design', 'participants', 'procedure'], weight: 1.2 },
    { name: 'measures', keywords: ['measure', 'instrument', 'scale', 'questionnaire', 'survey', 'assessment', 'reliability', 'validity'], weight: 1.0 },
    { name: 'results', keywords: ['results', 'findings', 'outcome', 'analysis', 'statistical', 'significant', 'effect'], weight: 1.2 },
    { name: 'implications', keywords: ['implication', 'discussion', 'practical implication', 'theoretical implication', 'contribution'], weight: 1.0 },
    { name: 'limitations', keywords: ['limitation', 'weakness', 'constraint', 'drawback', 'future research', 'future study'], weight: 0.8 }
  ]

  extractFromPaper(text: string): ExtractedData {
    // 分割段落
    const paragraphs = this.splitIntoParagraphs(text)
    
    // 提取摘要
    const abstract = this.extractAbstract(paragraphs)
    
    // 为每个部分找到最相关的段落 - 确保每个部分使用不同的段落
    const usedParagraphs = new Set<number>()
    
    const extracted: ExtractedData = {
      background: this.extractUniqueSection(paragraphs, 'background', usedParagraphs),
      theory: this.extractUniqueSection(paragraphs, 'theory', usedParagraphs),
      methodology: this.extractUniqueSection(paragraphs, 'methodology', usedParagraphs),
      measures: this.extractUniqueSection(paragraphs, 'measures', usedParagraphs),
      results: this.extractUniqueSection(paragraphs, 'results', usedParagraphs),
      implications: this.extractUniqueSection(paragraphs, 'implications', usedParagraphs),
      limitations: this.extractUniqueSection(paragraphs, 'limitations', usedParagraphs)
    }

    return extracted
  }

  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 50 && p.length < 2000)
  }

  private extractAbstract(paragraphs: string[]): string {
    // 通常摘要在论文开头
    for (const para of paragraphs.slice(0, 5)) {
      if (para.toLowerCase().includes('abstract') || 
          (para.length > 100 && para.length < 500 && this.isSummaryLike(para))) {
        return para.replace(/abstract[\s:]*/i, '').trim()
      }
    }
    return paragraphs[0] || ''
  }

  private isSummaryLike(text: string): boolean {
    const indicators = ['study', 'examined', 'investigated', 'found', 'results', 'participants', 'method']
    return indicators.some(word => text.toLowerCase().includes(word))
  }

  private extractSection(paragraphs: string[], sectionName: string): string {
    const section = this.sections.find(s => s.name === sectionName)
    if (!section) return 'Not extracted'

    // 计算每个段落的相关性得分
    const scoredParagraphs = paragraphs.map(para => {
      const score = this.calculateRelevance(para, section)
      return { para, score }
    })

    // 排序并选择得分最高的段落
    scoredParagraphs.sort((a, b) => b.score - a.score)
    
    // 选择前2个相关段落，确保它们足够相关
    const relevantParagraphs = scoredParagraphs
      .filter(item => item.score > 0.3)
      .slice(0, 2)
      .map(item => item.para)

    if (relevantParagraphs.length === 0) {
      return 'Not extracted'
    }

    return relevantParagraphs.join(' ').substring(0, 300)
  }

  private extractUniqueSection(paragraphs: string[], sectionName: string, usedParagraphs: Set<number>): string {
    const section = this.sections.find(s => s.name === sectionName)
    if (!section) return 'Not extracted'

    // 计算每个段落的相关性得分
    const scoredParagraphs = paragraphs.map((para, index) => {
      const score = this.calculateRelevance(para, section)
      return { para, score, index }
    })

    // 排序
    scoredParagraphs.sort((a, b) => b.score - a.score)
    
    // 找到得分最高的段落（即使已被使用，也允许重复使用）
    for (const item of scoredParagraphs) {
      if (item.score > 0.1) { // 降低阈值
        usedParagraphs.add(item.index)
        return item.para.substring(0, 300)
      }
    }

    return 'Not extracted'
  }

  private calculateRelevance(paragraph: string, section: SectionInfo): number {
    const lowerPara = paragraph.toLowerCase()
    let score = 0

    // 关键词匹配
    for (const keyword of section.keywords) {
      if (lowerPara.includes(keyword.toLowerCase())) {
        score += 1
      }
    }

    // 位置权重（某些部分通常在特定位置）
    if (section.name === 'background' && paragraph.length < 500) {
      score *= 1.2
    }
    if (section.name === 'results' && paragraph.includes('p <')) {
      score *= 1.5 // 包含统计显著性标记
    }

    // 长度惩罚（太短或太长的段落不太可能是好的摘要）
    if (paragraph.length < 80) score *= 0.5
    if (paragraph.length > 800) score *= 0.7

    return score * section.weight
  }

  private fillMissingSections(extracted: ExtractedData, abstract: string, paragraphs: string[]): void {
    const fullText = paragraphs.join(' ')

    for (const [key, value] of Object.entries(extracted)) {
      if (value === 'Not extracted' || value.length < 20) {
        // 尝试从摘要中提取
        const sectionKeywords = this.sections.find(s => s.name === key)?.keywords || []
        const relevantSentences = this.extractSentences(abstract)
          .filter(sent => sectionKeywords.some(kw => sent.toLowerCase().includes(kw.toLowerCase())))
        
        if (relevantSentences.length > 0) {
          (extracted as any)[key] = relevantSentences.slice(0, 2).join(' ').substring(0, 200)
        } else {
          // 使用全文前几句作为后备
          (extracted as any)[key] = this.extractSentences(fullText).slice(0, 2).join(' ').substring(0, 200)
        }
      }
    }
  }

  private extractSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 300)
  }

  // 提取论文元数据
  extractMetadata(text: string): {
    title: string
    authors: string[]
    year?: number
    journal?: string
  } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    
    // 标题通常在开头，是大写的较长文本
    let title = ''
    for (const line of lines.slice(0, 10)) {
      if (line.length > 20 && line.length < 200 && /^[A-Z]/.test(line)) {
        title = line
        break
      }
    }

    // 作者通常在标题附近，包含 @ 或数字上标
    const authors: string[] = []
    for (const line of lines.slice(0, 15)) {
      if (line.includes('@') || /,\s*[A-Z]/.test(line) || /\d+\s*$/.test(line)) {
        const parts = line.split(/,|\sand\s/)
        parts.forEach(p => {
          const trimmed = p.trim()
          if (trimmed.length > 3 && trimmed.length < 50) {
            authors.push(trimmed)
          }
        })
      }
    }

    // 年份提取
    const yearMatch = text.match(/\b(20\d{2})\b/)
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined

    return { title, authors, year }
  }
}

// 导出单例
export const smartAIExtractionService = new SmartAIExtractionService()
