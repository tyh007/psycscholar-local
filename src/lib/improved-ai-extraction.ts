// 改进的本地 AI 提取服务 - 基于位置和内容分析
import { type ExtractedData } from './database'

export class ImprovedAIExtractionService {
  extractFromPaper(text: string): ExtractedData {
    // 清理文本
    const cleanText = this.cleanText(text)
    
    // 分割成段落
    const paragraphs = this.splitIntoParagraphs(cleanText)
    
    // 提取各个部分
    const extracted: ExtractedData = {
      background: this.extractBackground(paragraphs, cleanText),
      theory: this.extractTheory(paragraphs, cleanText),
      methodology: this.extractMethodology(paragraphs, cleanText),
      measures: this.extractMeasures(paragraphs, cleanText),
      results: this.extractResults(paragraphs, cleanText),
      implications: this.extractImplications(paragraphs, cleanText),
      limitations: this.extractLimitations(paragraphs, cleanText)
    }

    // 确保没有空值
    this.fillEmptyFields(extracted, paragraphs)

    return extracted
  }

  private cleanText(text: string): string {
    return text
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // 压缩多余空行
      .replace(/\t/g, ' ') // 替换制表符
      .trim()
  }

  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 30 && p.length < 1500)
  }

  private extractBackground(paragraphs: string[], fullText: string): string {
    // Background 通常在论文开头
    // 1. 找标题为 Introduction 或 Background 的部分
    for (let i = 0; i < Math.min(5, paragraphs.length); i++) {
      const para = paragraphs[i].toLowerCase()
      if (para.includes('introduction') || para.includes('background')) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    // 2. 使用前两个段落作为 background
    if (paragraphs.length >= 2) {
      return (paragraphs[0] + ' ' + paragraphs[1]).substring(0, 300)
    }
    
    return paragraphs[0]?.substring(0, 300) || 'Not extracted'
  }

  private extractTheory(paragraphs: string[], fullText: string): string {
    // Theory 通常在 Introduction 之后
    const keywords = ['theory', 'theoretical', 'framework', 'model', 'hypothesis', 'conceptual']
    
    for (let i = 2; i < Math.min(15, paragraphs.length); i++) {
      const para = paragraphs[i].toLowerCase()
      if (keywords.some(kw => para.includes(kw))) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    // 如果没有找到，使用包含 theory 相关词汇的段落
    return this.findParagraphWithKeywords(paragraphs, keywords) || 'Not extracted'
  }

  private extractMethodology(paragraphs: string[], fullText: string): string {
    // Methodology 通常在中间位置
    const keywords = ['method', 'methodology', 'participants', 'procedure', 'design', 'sample']
    const startIdx = Math.floor(paragraphs.length * 0.2)
    const endIdx = Math.floor(paragraphs.length * 0.6)
    
    for (let i = startIdx; i < Math.min(endIdx, paragraphs.length); i++) {
      const para = paragraphs[i].toLowerCase()
      if (keywords.some(kw => para.includes(kw))) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    return this.findParagraphWithKeywords(paragraphs, keywords) || 'Not extracted'
  }

  private extractMeasures(paragraphs: string[], fullText: string): string {
    // Measures 通常在 Methodology 附近
    const keywords = ['measure', 'scale', 'instrument', 'questionnaire', 'survey', 'assessment']
    
    for (const para of paragraphs) {
      const lower = para.toLowerCase()
      if (keywords.some(kw => lower.includes(kw))) {
        return para.substring(0, 300)
      }
    }
    
    return 'Not extracted'
  }

  private extractResults(paragraphs: string[], fullText: string): string {
    // Results 通常在论文后半部分
    const keywords = ['results', 'findings', 'analysis', 'significant', 'p <', 'correlation', 'regression']
    const startIdx = Math.floor(paragraphs.length * 0.4)
    
    for (let i = startIdx; i < paragraphs.length; i++) {
      const para = paragraphs[i].toLowerCase()
      if (keywords.some(kw => para.includes(kw))) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    return this.findParagraphWithKeywords(paragraphs, keywords) || 'Not extracted'
  }

  private extractImplications(paragraphs: string[], fullText: string): string {
    // Implications 通常在 Results 之后
    const keywords = ['implication', 'discussion', 'contribution', 'practical', 'theoretical']
    const startIdx = Math.floor(paragraphs.length * 0.6)
    
    for (let i = startIdx; i < paragraphs.length; i++) {
      const para = paragraphs[i].toLowerCase()
      if (keywords.some(kw => para.includes(kw))) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    return this.findParagraphWithKeywords(paragraphs, keywords) || 'Not extracted'
  }

  private extractLimitations(paragraphs: string[], fullText: string): string {
    // Limitations 通常在论文末尾
    const keywords = ['limitation', 'weakness', 'constraint', 'future research', 'future study']
    
    // 从后往前找
    for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 10); i--) {
      const para = paragraphs[i].toLowerCase()
      if (keywords.some(kw => para.includes(kw))) {
        return paragraphs[i].substring(0, 300)
      }
    }
    
    return this.findParagraphWithKeywords(paragraphs, keywords) || 'Not extracted'
  }

  private findParagraphWithKeywords(paragraphs: string[], keywords: string[]): string | null {
    for (const para of paragraphs) {
      const lower = para.toLowerCase()
      if (keywords.some(kw => lower.includes(kw))) {
        return para.substring(0, 300)
      }
    }
    return null
  }

  private fillEmptyFields(extracted: ExtractedData, paragraphs: string[]): void {
    // 找到第一个非空段落作为后备
    const fallbackText = paragraphs[2]?.substring(0, 200) || paragraphs[0]?.substring(0, 200) || 'Not extracted'
    
    for (const [key, value] of Object.entries(extracted)) {
      if (!value || value === 'Not extracted' || value.length < 10) {
        (extracted as any)[key] = fallbackText
      }
    }
  }

  // 提取元数据
  extractMetadata(text: string): {
    title: string
    authors: string[]
    year?: number
    doi?: string
  } {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    
    // 标题 - 通常在前几行，长度适中，首字母大写
    let title = ''
    for (const line of lines.slice(0, 10)) {
      if (line.length > 20 && line.length < 200 && /^[A-Z]/.test(line) && !line.includes('@')) {
        title = line
        break
      }
    }

    // 作者 - 查找包含逗号或数字的行
    const authors: string[] = []
    for (const line of lines.slice(0, 20)) {
      if ((line.includes(',') || /\d/.test(line)) && line.length < 100) {
        const parts = line.split(/,|\s+and\s+/i)
        parts.forEach(p => {
          const trimmed = p.trim().replace(/^\d+\s*/, '')
          if (trimmed.length > 3 && trimmed.length < 50 && /^[A-Z]/.test(trimmed)) {
            authors.push(trimmed)
          }
        })
      }
    }

    // 年份
    const yearMatch = text.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? parseInt(yearMatch[0]) : undefined

    // DOI
    const doiMatch = text.match(/doi[:\s]+(10\.\S+)/i)
    const doi = doiMatch ? doiMatch[1] : undefined

    return { title, authors, year, doi }
  }
}

// 导出单例
export const improvedAIExtractionService = new ImprovedAIExtractionService()
