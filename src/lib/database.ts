import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

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
  prompt?: string
  createdAt: Date
}

type JsonResult<T> = {
  success: boolean
  error?: string
} & T

function toDate(value?: string | Date | null) {
  if (!value) return undefined
  return value instanceof Date ? value : new Date(value)
}

function mapProject(project: any): Project {
  return {
    ...project,
    createdAt: toDate(project.createdAt)!,
    updatedAt: toDate(project.updatedAt)!
  }
}

function mapPaper(paper: any): Paper {
  return {
    ...paper,
    uploadedAt: toDate(paper.uploadedAt)!,
    processedAt: toDate(paper.processedAt),
    trashedAt: toDate(paper.trashedAt)
  }
}

function mapCustomField(field: any): CustomField {
  return {
    ...field,
    createdAt: toDate(field.createdAt)!
  }
}

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const supabase = getSupabaseBrowserClient()
  const {
    data: { session }
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Please sign in to continue.')
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {})
    }
  })

  const data = (await response.json()) as JsonResult<T>

  if (!response.ok || data.success === false) {
    throw new Error(data.error || 'Request failed')
  }

  return data as T
}

class RemotePsycScholarDB {
  async createProject(name: string, description?: string): Promise<Project> {
    const data = await apiFetch<{ project: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    })
    return mapProject(data.project)
  }

  async getProjects(): Promise<Project[]> {
    const data = await apiFetch<{ projects: Project[] }>('/api/projects')
    return data.projects.map(mapProject)
  }

  async getProject(id: string): Promise<Project | undefined> {
    const data = await apiFetch<{ project: Project | null }>(`/api/projects/${id}`)
    return data.project ? mapProject(data.project) : undefined
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    await apiFetch(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  async deleteProject(id: string): Promise<void> {
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
  }

  async addPaper(paper: Omit<Paper, 'id'>): Promise<string> {
    const data = await apiFetch<{ id: string }>('/api/papers', {
      method: 'POST',
      body: JSON.stringify(paper)
    })
    return data.id
  }

  async getPapers(projectId: string): Promise<Paper[]> {
    const data = await apiFetch<{ papers: Paper[] }>(`/api/papers?projectId=${encodeURIComponent(projectId)}&view=library`)
    return data.papers.map(mapPaper)
  }

  async getTrashPapers(projectId: string): Promise<Paper[]> {
    const data = await apiFetch<{ papers: Paper[] }>(`/api/papers?projectId=${encodeURIComponent(projectId)}&view=trash`)
    return data.papers.map(mapPaper)
  }

  async movePaperToTrash(id: number | string): Promise<void> {
    await apiFetch(`/api/papers/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'moveToTrash' })
    })
  }

  async restorePaperFromTrash(id: number | string): Promise<void> {
    await apiFetch(`/api/papers/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restoreFromTrash' })
    })
  }

  async updatePaper(id: number | string, updates: Partial<Paper>): Promise<number> {
    await apiFetch(`/api/papers/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    return 1
  }

  async getPaper(id: number | string): Promise<Paper | undefined> {
    const data = await apiFetch<{ paper: Paper | null }>(`/api/papers/${String(id)}`)
    return data.paper ? mapPaper(data.paper) : undefined
  }

  async deletePaper(id: number | string): Promise<void> {
    await apiFetch(`/api/papers/${String(id)}`, { method: 'DELETE' })
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

  async addCustomField(field: Omit<CustomField, 'id'>): Promise<string> {
    const data = await apiFetch<{ id: string }>('/api/custom-fields', {
      method: 'POST',
      body: JSON.stringify(field)
    })
    return data.id
  }

  async getCustomFields(projectId: string): Promise<CustomField[]> {
    const data = await apiFetch<{ fields: CustomField[] }>(`/api/custom-fields?projectId=${encodeURIComponent(projectId)}`)
    return data.fields.map(mapCustomField)
  }

  async updateCustomField(id: string | number, updates: Partial<Omit<CustomField, 'id'>>): Promise<void> {
    await apiFetch(`/api/custom-fields/${String(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  async deleteCustomField(id: string | number): Promise<void> {
    await apiFetch(`/api/custom-fields/${String(id)}`, { method: 'DELETE' })
  }
}

export const db = new RemotePsycScholarDB()
