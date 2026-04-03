// 简单的本地 AI 提取服务 - 基于规则和关键词匹配
import { type ExtractedData } from './database'

export class LocalAIExtractionService {
  private keywords = {
    background: ['background', 'introduction', 'overview', 'context', 'history', 'previous work'],
    theory: ['theory', 'framework', 'model', 'approach', 'conceptual', 'theoretical'],
    methodology: ['method', 'methodology', 'approach', 'procedure', 'design', 'experiment', 'study design'],
    measures: ['measure', 'scale', 'instrument', 'tool', 'assessment', 'questionnaire', 'survey'],
    results: ['result', 'finding', 'outcome', 'conclusion', 'discovery', 'analysis'],
    implications: ['implication', 'application', 'practice', 'relevance', 'significance', 'impact'],
    limitations: ['limitation', 'weakness', 'constraint', 'drawback', 'challenge', 'future work']
  }

  extractFromPaper(text: string): ExtractedData {
    const sentences = this.splitIntoSentences(text)
    const extracted: ExtractedData = {
      background: 'Not extracted',
      theory: 'Not extracted',
      methodology: 'Not extracted',
      measures: 'Not extracted',
      results: 'Not extracted',
      implications: 'Not extracted',
      limitations: 'Not extracted'
    }

    // 为每个类别提取相关句子
    for (const [category, keywords] of Object.entries(this.keywords)) {
      const relevantSentences = sentences.filter(sentence => 
        keywords.some(keyword => 
          sentence.toLowerCase().includes(keyword.toLowerCase())
        )
      )
      
      if (relevantSentences.length > 0) {
        // 取前 2-3 个相关句子
        const key = category as keyof Omit<ExtractedData, 'customFields'>
        extracted[key] = relevantSentences.slice(0, 2).join(' ').substring(0, 300) as ExtractedData[keyof Omit<ExtractedData, 'customFields'>]
      }
    }

    return extracted
  }

  private splitIntoSentences(text: string): string[] {
    // 简单的句子分割
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
      .slice(0, 50) // 限制句子数量
  }

  // 智能提取摘要
  extractAbstract(text: string): string {
    const sentences = this.splitIntoSentences(text)
    
    // 寻找包含摘要关键词的句子
    const abstractKeywords = ['abstract', 'summary', 'overview', 'introduction']
    const abstractSentences = sentences.filter(sentence => 
      abstractKeywords.some(keyword => 
        sentence.toLowerCase().includes(keyword.toLowerCase())
      )
    )
    
    if (abstractSentences.length > 0) {
      return abstractSentences.slice(0, 3).join(' ').substring(0, 500)
    }
    
    // 如果没有找到摘要，返回前几句
    return sentences.slice(0, 3).join(' ').substring(0, 500)
  }

  // 提取关键信息
  extractKeyInfo(text: string): {
    title: string
    authors: string[]
    year?: string
    journal?: string
  } {
    const lines = text.split('\n').map(line => line.trim())
    
    // 简单的标题提取（第一行或包含大写字母的行）
    const title = lines.find(line => 
      line.length > 10 && 
      line.length < 200 && 
      /^[A-Z]/.test(line) &&
      !line.includes('http') &&
      !line.includes('@')
    ) || 'Unknown Title'
    
    // 简单的作者提取（包含 @ 或 "and" 的行）
    const authorLines = lines.filter(line => 
      line.includes('@') || 
      line.includes(' and ') ||
      /,\s*[A-Z]/.test(line)
    )
    
    const authors = authorLines.length > 0 
      ? authorLines[0].split(/,|\sand\s/).map(a => a.trim()).filter(a => a.length > 2)
      : ['Unknown Author']
    
    // 简单的年份提取（4位数字）
    const yearMatch = text.match(/\b(19|20)\d{2}\b/)
    const year = yearMatch ? yearMatch[0] : undefined
    
    return { title, authors, year }
  }
}

// 导出单例实例
export const localAIExtractionService = new LocalAIExtractionService()
