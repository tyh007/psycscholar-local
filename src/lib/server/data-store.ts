import { type CustomField, type ExtractedData, type Paper, type Project } from '@/lib/database'
import { createServiceRoleClient } from '@/lib/server/supabase'

type ProjectRow = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  paper_count: number
}

type PaperRow = {
  id: string
  owner_id: string
  project_id: string
  file_name: string
  file_size: number
  file_type: string
  uploaded_at: string
  processed_at: string | null
  title: string | null
  authors: string | null
  year: number | null
  journal: string | null
  doi: string | null
  abstract: string | null
  full_text: string | null
  extracted_data: ExtractedData | null
  processing_status: Paper['processingStatus']
  error_message: string | null
  in_trash: boolean
  trashed_at: string | null
}

type CustomFieldRow = {
  id: string
  owner_id: string
  project_id: string
  name: string
  description: string | null
  prompt: string | null
  created_at: string
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    paperCount: row.paper_count
  }
}

function mapPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    uploadedAt: new Date(row.uploaded_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
    title: row.title || undefined,
    authors: row.authors || undefined,
    year: row.year ?? undefined,
    journal: row.journal || undefined,
    doi: row.doi || undefined,
    abstract: row.abstract || undefined,
    fullText: row.full_text || undefined,
    extractedData: row.extracted_data || undefined,
    processingStatus: row.processing_status,
    errorMessage: row.error_message || undefined,
    inTrash: row.in_trash,
    trashedAt: row.trashed_at ? new Date(row.trashed_at) : undefined
  }
}

function mapCustomField(row: CustomFieldRow): CustomField {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description || undefined,
    prompt: row.prompt || undefined,
    createdAt: new Date(row.created_at)
  }
}

function toIsoDate(value?: Date | string | null) {
  if (!value) return null
  return new Date(value).toISOString()
}

async function recalcPaperCount(projectId: string, ownerId: string) {
  const supabase = createServiceRoleClient()
  const { count, error } = await supabase
    .from('papers')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('project_id', projectId)
    .eq('in_trash', false)

  if (error) throw error

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      paper_count: count || 0,
      updated_at: new Date().toISOString()
    })
    .eq('owner_id', ownerId)
    .eq('id', projectId)

  if (updateError) throw updateError
}

export async function createProject(ownerId: string, name: string, description?: string) {
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: ownerId,
      name,
      description: description || null,
      created_at: now,
      updated_at: now,
      paper_count: 0
    })
    .select()
    .single<ProjectRow>()

  if (error) throw error
  return mapProject(data)
}

export async function getProjects(ownerId: string) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapProject)
}

export async function getProject(ownerId: string, id: string) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', id)
    .maybeSingle<ProjectRow>()

  if (error) throw error
  return data ? mapProject(data) : undefined
}

export async function updateProject(ownerId: string, id: string, updates: Partial<Project>) {
  const supabase = createServiceRoleClient()
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.description !== undefined) payload.description = updates.description || null
  if (updates.paperCount !== undefined) payload.paper_count = updates.paperCount

  const { error } = await supabase.from('projects').update(payload).eq('owner_id', ownerId).eq('id', id)
  if (error) throw error
}

export async function deleteProject(ownerId: string, id: string) {
  const supabase = createServiceRoleClient()
  await supabase.from('papers').delete().eq('owner_id', ownerId).eq('project_id', id)
  await supabase.from('custom_fields').delete().eq('owner_id', ownerId).eq('project_id', id)
  const { error } = await supabase.from('projects').delete().eq('owner_id', ownerId).eq('id', id)
  if (error) throw error
}

export async function addPaper(ownerId: string, paper: Omit<Paper, 'id'>) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('papers')
    .insert({
      owner_id: ownerId,
      project_id: paper.projectId,
      file_name: paper.fileName,
      file_size: paper.fileSize,
      file_type: paper.fileType,
      uploaded_at: toIsoDate(paper.uploadedAt),
      processed_at: toIsoDate(paper.processedAt),
      title: paper.title || null,
      authors: paper.authors || null,
      year: paper.year ?? null,
      journal: paper.journal || null,
      doi: paper.doi || null,
      abstract: paper.abstract || null,
      full_text: paper.fullText || null,
      extracted_data: paper.extractedData || null,
      processing_status: paper.processingStatus,
      error_message: paper.errorMessage || null,
      in_trash: !!paper.inTrash,
      trashed_at: toIsoDate(paper.trashedAt)
    })
    .select('id, project_id')
    .single<{ id: string; project_id: string }>()

  if (error) throw error
  await recalcPaperCount(data.project_id, ownerId)
  return data.id
}

export async function getPapers(ownerId: string, projectId: string, includeTrash = false) {
  const supabase = createServiceRoleClient()
  let query = supabase
    .from('papers')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })

  query = query.eq('in_trash', includeTrash)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(mapPaper)
}

export async function getPaper(ownerId: string, id: string) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('id', id)
    .maybeSingle<PaperRow>()

  if (error) throw error
  return data ? mapPaper(data) : undefined
}

export async function updatePaper(ownerId: string, id: string, updates: Partial<Paper>) {
  const supabase = createServiceRoleClient()
  const payload: Record<string, unknown> = {}
  if (updates.projectId !== undefined) payload.project_id = updates.projectId
  if (updates.fileName !== undefined) payload.file_name = updates.fileName
  if (updates.fileSize !== undefined) payload.file_size = updates.fileSize
  if (updates.fileType !== undefined) payload.file_type = updates.fileType
  if (updates.uploadedAt !== undefined) payload.uploaded_at = toIsoDate(updates.uploadedAt)
  if (updates.processedAt !== undefined) payload.processed_at = toIsoDate(updates.processedAt)
  if (updates.title !== undefined) payload.title = updates.title || null
  if (updates.authors !== undefined) payload.authors = updates.authors || null
  if (updates.year !== undefined) payload.year = updates.year ?? null
  if (updates.journal !== undefined) payload.journal = updates.journal || null
  if (updates.doi !== undefined) payload.doi = updates.doi || null
  if (updates.abstract !== undefined) payload.abstract = updates.abstract || null
  if (updates.fullText !== undefined) payload.full_text = updates.fullText || null
  if (updates.extractedData !== undefined) payload.extracted_data = updates.extractedData || null
  if (updates.processingStatus !== undefined) payload.processing_status = updates.processingStatus
  if (updates.errorMessage !== undefined) payload.error_message = updates.errorMessage || null
  if (updates.inTrash !== undefined) payload.in_trash = !!updates.inTrash
  if (updates.trashedAt !== undefined) payload.trashed_at = toIsoDate(updates.trashedAt)

  const existing = await getPaper(ownerId, id)
  const { error } = await supabase.from('papers').update(payload).eq('owner_id', ownerId).eq('id', id)
  if (error) throw error

  if (existing?.projectId) {
    await recalcPaperCount(existing.projectId, ownerId)
  }

  return 1
}

export async function movePaperToTrash(ownerId: string, id: string) {
  const paper = await getPaper(ownerId, id)
  if (!paper) return
  await updatePaper(ownerId, id, { inTrash: true, trashedAt: new Date() })
}

export async function restorePaperFromTrash(ownerId: string, id: string) {
  await updatePaper(ownerId, id, { inTrash: false, trashedAt: undefined })
}

export async function deletePaper(ownerId: string, id: string) {
  const supabase = createServiceRoleClient()
  const paper = await getPaper(ownerId, id)
  const { error } = await supabase.from('papers').delete().eq('owner_id', ownerId).eq('id', id)
  if (error) throw error
  if (paper?.projectId) {
    await recalcPaperCount(paper.projectId, ownerId)
  }
}

export async function addCustomField(ownerId: string, field: Omit<CustomField, 'id'>) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('custom_fields')
    .insert({
      owner_id: ownerId,
      project_id: field.projectId,
      name: field.name,
      description: field.description || null,
      prompt: field.prompt || null,
      created_at: toIsoDate(field.createdAt)
    })
    .select('id')
    .single<{ id: string }>()

  if (error) throw error
  return data.id
}

export async function getCustomFields(ownerId: string, projectId: string) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('custom_fields')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map(mapCustomField)
}

export async function updateCustomField(ownerId: string, id: string, updates: Partial<Omit<CustomField, 'id'>>) {
  const supabase = createServiceRoleClient()
  const payload: Record<string, unknown> = {}
  if (updates.projectId !== undefined) payload.project_id = updates.projectId
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.description !== undefined) payload.description = updates.description || null
  if (updates.prompt !== undefined) payload.prompt = updates.prompt || null
  if (updates.createdAt !== undefined) payload.created_at = toIsoDate(updates.createdAt)

  const { error } = await supabase.from('custom_fields').update(payload).eq('owner_id', ownerId).eq('id', id)
  if (error) throw error
}

export async function deleteCustomField(ownerId: string, id: string) {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('custom_fields').delete().eq('owner_id', ownerId).eq('id', id)
  if (error) throw error
}
