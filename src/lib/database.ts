import Dexie, { type Table } from 'dexie'

export interface Project {
  id?: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  paperCount: number
}

export interface Paper {
  id?: string
  projectId: string
  fileName: string
  fileSize: number
  fileType: string
  uploadedAt: Date
  processedAt?: Date
  title?: string
  authors?: string
  year?: number
  journal?: string
  doi?: string
  abstract?: string
  fullText?: string
  extractedData?: ExtractedData
  processingStatus: 'pending' | 'processing' | 'completed' | 'error'
  errorMessage?: string
  /** Soft-delete: hidden from main grid until restored or permanently deleted */
  inTrash?: boolean
  trashedAt?: Date
}

export interface ExtractedData {
  background: string
  theory: string
  methodology: string
  measures: string
  results: string
  implications: string
  limitations: string
  customFields?: Record<string, string>
}

export interface CustomField {
  id?: string
  projectId: string
  name: string
  description?: string
  /** AI extraction instructions for this column */
  prompt?: string
  createdAt: Date
}

export class PsycScholarDB extends Dexie {
  projects!: Table<Project>
  papers!: Table<Paper>
  customFields!: Table<CustomField>

  constructor() {
    super('PsycScholarDB')
    
    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt, paperCount',
      papers: '++id, projectId, fileName, uploadedAt, processingStatus, title, authors, year',
      customFields: '++id, projectId, name, createdAt'
    })
  }

  // Project operations
  async createProject(name: string, description?: string): Promise<Project> {
    const project: Project = {
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
      paperCount: 0
    }
    
    const id = await this.projects.add(project)
    return { ...project, id: id.toString() }
  }

  async getProjects(): Promise<Project[]> {
    return await this.projects.toArray()
  }

  async getProject(id: string): Promise<Project | undefined> {
    return await this.projects.get(id)
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    await this.projects.update(id, { ...updates, updatedAt: new Date() })
  }

  async deleteProject(id: string): Promise<void> {
    await this.transaction('rw', this.projects, this.papers, this.customFields, async () => {
      await this.papers.where('projectId').equals(id).delete()
      await this.customFields.where('projectId').equals(id).delete()
      await this.projects.delete(id)
    })
  }

  // Paper operations
  async addPaper(paper: Omit<Paper, 'id'>): Promise<string> {
    const id = await this.papers.add({ ...paper, inTrash: false })
    await this.recalcPaperCount(paper.projectId)
    return id.toString()
  }

  /** Active papers only (not in trash) */
  async getPapers(projectId: string): Promise<Paper[]> {
    const rows = await this.papers.where('projectId').equals(projectId).toArray()
    return rows.filter(p => !p.inTrash)
  }

  /** Papers moved to bin */
  async getTrashPapers(projectId: string): Promise<Paper[]> {
    const rows = await this.papers.where('projectId').equals(projectId).toArray()
    return rows.filter(p => !!p.inTrash)
  }

  async recalcPaperCount(projectId: string): Promise<void> {
    const rows = await this.papers.where('projectId').equals(projectId).toArray()
    const n = rows.filter(p => !p.inTrash).length
    await this.projects.update(projectId, { paperCount: n })
  }

  async movePaperToTrash(id: number | string): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    const paper = await this.papers.get(numericId)
    if (!paper) return
    await this.papers.update(numericId, { inTrash: true, trashedAt: new Date() })
    await this.recalcPaperCount(paper.projectId)
  }

  async restorePaperFromTrash(id: number | string): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    const paper = await this.papers.get(numericId)
    if (!paper) return
    await this.papers.update(numericId, { inTrash: false, trashedAt: undefined })
    await this.recalcPaperCount(paper.projectId)
  }

  async updatePaper(id: number | string, updates: Partial<Paper>): Promise<number> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    console.log(`Updating paper with ID: ${numericId}`)
    
    // 确保 extractedData 被正确序列化
    if (updates.extractedData) {
      console.log('Extracted data to save:', JSON.stringify(updates.extractedData, null, 2))
    }
    
    try {
      const result = await this.papers.update(numericId, updates)
      console.log(`Update result: ${result} rows affected`)
      
      if (result === 0) {
        console.error(`No paper found with ID ${numericId}`)
        throw new Error(`Paper with ID ${numericId} not found`)
      }
      
      // 立即验证更新
      const verify = await this.papers.get(numericId)
      console.log('Verified paper after update:', verify?.id, 'has extractedData:', !!verify?.extractedData)
      
      return result
    } catch (error) {
      console.error(`Update failed for paper ${numericId}:`, error)
      throw error
    }
  }

  async getPaper(id: number | string): Promise<Paper | undefined> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    console.log(`Getting paper with ID: ${numericId}`)
    return await this.papers.get(numericId)
  }

  /** Permanently remove a paper row (e.g. from bin) */
  async deletePaper(id: number | string): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    const paper = await this.papers.get(numericId)
    if (paper) {
      await this.papers.delete(numericId)
      await this.recalcPaperCount(paper.projectId)
    }
  }

  async searchPapers(projectId: string, query: string): Promise<Paper[]> {
    const papers = await this.getPapers(projectId)
    
    if (!query.trim()) return papers

    const lowerQuery = query.toLowerCase()
    return papers.filter(paper =>
      paper.title?.toLowerCase().includes(lowerQuery) ||
      paper.authors?.toLowerCase().includes(lowerQuery) ||
      paper.journal?.toLowerCase().includes(lowerQuery) ||
      paper.fullText?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.background?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.theory?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.methodology?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.measures?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.results?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.implications?.toLowerCase().includes(lowerQuery) ||
      paper.extractedData?.limitations?.toLowerCase().includes(lowerQuery)
    )
  }

  // Custom field operations
  async addCustomField(field: Omit<CustomField, 'id'>): Promise<string> {
    const id = await this.customFields.add(field)
    return id.toString()
  }

  async getCustomFields(projectId: string): Promise<CustomField[]> {
    return await this.customFields.where('projectId').equals(projectId).toArray()
  }

  async updateCustomField(id: string | number, updates: Partial<Omit<CustomField, 'id'>>): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    await this.customFields.update(numericId, updates)
  }

  async deleteCustomField(id: string | number): Promise<void> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id
    await this.customFields.delete(numericId)
  }

  // Batch operations
  async bulkUpdatePapers(updates: Array<{ id: string; data: Partial<Paper> }>): Promise<void> {
    await this.transaction('rw', this.papers, async () => {
      for (const update of updates) {
        await this.papers.update(update.id, update.data)
      }
    })
  }

  async getProcessingStats(projectId: string): Promise<{
    total: number
    pending: number
    processing: number
    completed: number
    error: number
  }> {
    const papers = await this.getPapers(projectId)
    
    return {
      total: papers.length,
      pending: papers.filter(p => p.processingStatus === 'pending').length,
      processing: papers.filter(p => p.processingStatus === 'processing').length,
      completed: papers.filter(p => p.processingStatus === 'completed').length,
      error: papers.filter(p => p.processingStatus === 'error').length
    }
  }
}

export const db = new PsycScholarDB()
