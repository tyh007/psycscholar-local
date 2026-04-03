"use client"

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/sidebar'
import { ResizableSidebar } from '@/components/resizable-sidebar'
import { MainContent } from '@/components/main-content'
import { PaperDetailView } from '@/components/paper-detail-view'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useAIExtraction } from '@/hooks/use-ai-extraction'
import { db, type Project, type Paper, type ExtractedData, type CustomField } from '@/lib/database'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'
import { PSYCHOLOGY_CUSTOM_FIELDS } from '@/lib/prompt-builder'

function dbCustomFieldToDef(row: CustomField): CustomFieldDefinition {
  return {
    id: String(row.id ?? ''),
    name: row.name,
    description: row.description || '',
    prompt: row.prompt || row.description || ''
  }
}

function defaultExtracted(): ExtractedData {
  return {
    background: 'Not extracted',
    theory: 'Not extracted',
    methodology: 'Not extracted',
    measures: 'Not extracted',
    results: 'Not extracted',
    implications: 'Not extracted',
    limitations: 'Not extracted'
  }
}

function readInitialSidebarWidth() {
  if (typeof window === 'undefined') return 320
  const w = localStorage.getItem('psycscholar-sidebar-w')
  if (!w) return 320
  const n = parseInt(w, 10)
  return Number.isNaN(n) ? 320 : Math.min(520, Math.max(200, n))
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [projectCustomFields, setProjectCustomFields] = useState<CustomFieldDefinition[]>([])
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'library' | 'trash'>('library')
  const [trashCount, setTrashCount] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth)

  const { uploadFiles } = useFileUpload()
  const {
    aiState,
    checkAIAvailability,
    setCurrentModel,
    detailLevel,
    setDetailLevel,
    extractionJobs,
    getActiveJobsCount,
    extractFromPaper,
    extractCustomField
  } = useAIExtraction()

  const persistSidebarWidth = useCallback((w: number) => {
    setSidebarWidth(w)
    localStorage.setItem('psycscholar-sidebar-w', String(w))
  }, [])

  const refreshCustomFields = useCallback(async () => {
    if (!activeProject) {
      setProjectCustomFields([])
      return
    }
    const rows = await db.getCustomFields(activeProject)
    setProjectCustomFields(rows.map(dbCustomFieldToDef))
  }, [activeProject])

  const refreshList = useCallback(async () => {
    if (!activeProject) return
    const list =
      viewMode === 'trash'
        ? await db.getTrashPapers(activeProject)
        : await db.getPapers(activeProject)
    setPapers(list)
    const trash = await db.getTrashPapers(activeProject)
    setTrashCount(trash.length)
    const updatedProjects = await db.getProjects()
    setProjects(updatedProjects)
  }, [activeProject, viewMode])

  const runExtractForCustomField = useCallback(
    async (field: CustomFieldDefinition) => {
      if (!activeProject) return
      const list = await db.getPapers(activeProject)
      for (const paper of list) {
        if (!paper.fullText || paper.id === undefined) continue
        const res = await extractCustomField(String(paper.id), paper.fileName, paper.fullText, field)
        if (res.success && res.result) {
          const existing = paper.extractedData
          const base = existing ? { ...existing } : defaultExtracted()
          await db.updatePaper(paper.id, {
            extractedData: {
              ...base,
              customFields: { ...(base.customFields || {}), [field.id]: res.result }
            }
          })
        }
      }
      await refreshList()
    },
    [activeProject, extractCustomField, refreshList]
  )

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await checkAIAvailability()
        const projectList = await db.getProjects()
        setProjects(projectList)
        if (projectList.length > 0 && !activeProject) {
          setActiveProject(projectList[0].id!)
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
        toast.error('Failed to initialize application')
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [])

  useEffect(() => {
    if (activeProject) {
      const load = async () => {
        try {
          await refreshList()
          await refreshCustomFields()
        } catch (error) {
          console.error('Failed to load papers:', error)
          toast.error('Failed to load papers')
        }
      }
      load()
    } else {
      setPapers([])
      setTrashCount(0)
      setProjectCustomFields([])
    }
  }, [activeProject, viewMode, refreshCustomFields, refreshList])

  const handleProjectSelect = (projectId: string) => {
    setActiveProject(projectId)
    setViewMode('library')
  }

  const handleProjectCreate = async (name: string) => {
    try {
      const newProject = await db.createProject(name)
      setProjects([...projects, newProject])
      setActiveProject(newProject.id!)
      setViewMode('library')
      toast.success(`Project "${name}" created successfully`)
    } catch (error) {
      console.error('Failed to create project:', error)
      toast.error('Failed to create project')
    }
  }

  const handleProjectDelete = async (projectId: string) => {
    try {
      await db.deleteProject(projectId)
      setProjects(projects.filter(p => p.id !== projectId))

      if (activeProject === projectId) {
        const remainingProjects = projects.filter(p => p.id !== projectId)
        setActiveProject(remainingProjects.length > 0 ? remainingProjects[0].id! : null)
      }

      toast.success('Project deleted successfully')
    } catch (error) {
      console.error('Failed to delete project:', error)
      toast.error('Failed to delete project')
    }
  }

  const handleMoveToTrash = async (paperId: string) => {
    if (!activeProject) return
    try {
      await db.movePaperToTrash(paperId)
      await refreshList()
      if (selectedPaperId === String(paperId)) setSelectedPaperId(null)
      toast.success('Moved to recycle bin')
    } catch (error) {
      console.error(error)
      toast.error('Could not move to recycle bin')
    }
  }

  const handleRestorePaper = async (paperId: string) => {
    try {
      await db.restorePaperFromTrash(paperId)
      await refreshList()
      toast.success('Restored to paper list')
    } catch (error) {
      console.error(error)
      toast.error('Could not restore')
    }
  }

  const handlePermanentDelete = async (paperId: string) => {
    try {
      await db.deletePaper(paperId)
      await refreshList()
      if (selectedPaperId === String(paperId)) setSelectedPaperId(null)
      toast.success('Permanently deleted')
    } catch (error) {
      console.error(error)
      toast.error('Could not delete')
    }
  }

  const handlePaperUpload = async (files: File[]) => {
    if (!activeProject) {
      toast.error('Please select a project first')
      return
    }

    setViewMode('library')

    try {
      const result = await uploadFiles(files, activeProject)
      await refreshList()
      await refreshCustomFields()

      if (result.success > 0) {
        toast.success(`Successfully uploaded ${result.success} paper${result.success > 1 ? 's' : ''}`)
      }

      if (result.failed > 0) {
        toast.error(`Failed to upload ${result.failed} file${result.failed > 1 ? 's' : ''}`)
        result.errors.forEach(error => {
          console.error(`${error.fileName}: ${error.error}`)
        })
      }
    } catch (error) {
      console.error('Upload failed:', error)
      toast.error('Upload failed')
    }
  }

  const handlePaperSelect = (paperId: string | number) => {
    setSelectedPaperId(String(paperId))
  }

  const handleReExtract = async (paperId: string) => {
    const paper = await db.getPaper(paperId)
    if (!paper?.fullText) {
      toast.error('No full text available for this paper.')
      return
    }
    const result = await extractFromPaper(paperId, paper.fileName, paper.fullText, {
      customFields: projectCustomFields
    })
    if (result.success && result.extractedData) {
      await db.updatePaper(paperId, {
        extractedData: result.extractedData,
        processingStatus: 'completed'
      })
      await refreshList()
      toast.success('Re-extraction completed')
    } else {
      toast.error(result.error || 'Re-extraction failed')
    }
  }

  const handleAddCustomField = async (field: CustomFieldDefinition) => {
    if (!activeProject) return
    try {
      const id = await db.addCustomField({
        projectId: activeProject,
        name: field.name,
        description: field.description,
        prompt: field.prompt,
        createdAt: new Date()
      })
      const def: CustomFieldDefinition = {
        id: String(id),
        name: field.name,
        description: field.description,
        prompt: field.prompt
      }
      await refreshCustomFields()
      toast.message('Filling new column for all papers…')
      await runExtractForCustomField(def)
      toast.success('Custom column ready')
    } catch (e) {
      console.error(e)
      toast.error('Could not add custom column')
    }
  }

  const handleUpdateCustomField = async (fieldId: string, updates: Partial<CustomFieldDefinition>) => {
    try {
      await db.updateCustomField(fieldId, {
        name: updates.name,
        description: updates.description,
        prompt: updates.prompt
      })
      await refreshCustomFields()
    } catch (e) {
      console.error(e)
      toast.error('Could not update column')
    }
  }

  const handleDeleteCustomField = async (fieldId: string) => {
    if (!activeProject) return
    try {
      await db.deleteCustomField(fieldId)
      const list = await db.getPapers(activeProject)
      for (const paper of list) {
        const cf = paper.extractedData?.customFields
        if (cf && fieldId in cf) {
          const next = { ...cf }
          delete next[fieldId]
          await db.updatePaper(paper.id!, {
            extractedData: {
              ...paper.extractedData!,
              customFields: Object.keys(next).length ? next : undefined
            }
          })
        }
      }
      await refreshCustomFields()
      await refreshList()
      toast.success('Custom column removed')
    } catch (e) {
      console.error(e)
      toast.error('Could not remove column')
    }
  }

  const handleAddPsychologyFields = async () => {
    if (!activeProject) return
    try {
      const existing = await db.getCustomFields(activeProject)
      const byName = new Set(existing.map(e => e.name))
      let added = 0
      for (const def of PSYCHOLOGY_CUSTOM_FIELDS) {
        if (byName.has(def.name)) continue
        const id = await db.addCustomField({
          projectId: activeProject,
          name: def.name,
          description: def.description,
          prompt: def.prompt,
          createdAt: new Date()
        })
        const fieldDef: CustomFieldDefinition = { ...def, id: String(id) }
        await runExtractForCustomField(fieldDef)
        byName.add(def.name)
        added++
      }
      await refreshCustomFields()
      await refreshList()
      if (added === 0) toast.message('All psychology templates are already added')
      else toast.success(`Added ${added} psychology column(s)`)
    } catch (e) {
      console.error(e)
      toast.error('Could not add psychology fields')
    }
  }

  const selectedPaper: Paper | null =
    papers.find(p => p.id !== undefined && String(p.id) === selectedPaperId) ?? null

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading PsycScholar...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <ResizableSidebar width={sidebarWidth} onWidthChange={persistSidebarWidth}>
        <Sidebar
          projects={projects}
          activeProject={activeProject}
          onProjectSelect={handleProjectSelect}
          onProjectCreate={handleProjectCreate}
          onProjectDelete={handleProjectDelete}
          onOpenSettings={() => setAppSettingsOpen(true)}
          viewMode={viewMode}
          trashCount={trashCount}
          onOpenTrash={() => setViewMode('trash')}
          onBackToLibrary={() => setViewMode('library')}
        />
      </ResizableSidebar>
      <MainContent
        activeProject={activeProject}
        papers={papers}
        isTrashView={viewMode === 'trash'}
        onBackFromTrash={() => setViewMode('library')}
        onPaperUpload={handlePaperUpload}
        onPaperSelect={handlePaperSelect}
        onPaperMoveToTrash={handleMoveToTrash}
        onPaperRestore={handleRestorePaper}
        onPaperPermanentDelete={handlePermanentDelete}
        onRefresh={() => void refreshList()}
        aiState={aiState}
        globalDetailLevel={detailLevel === 'detailed' ? 100 : 0}
        setGlobalDetailLevel={(level) => setDetailLevel(level > 50 ? 'detailed' : 'brief')}
        extractionJobs={extractionJobs}
        activeExtractionJobs={getActiveJobsCount()}
        customFieldDefinitions={projectCustomFields}
        onAddCustomField={handleAddCustomField}
        onUpdateCustomField={handleUpdateCustomField}
        onDeleteCustomField={handleDeleteCustomField}
        onAddPsychologyFields={handleAddPsychologyFields}
        onAIModelChange={setCurrentModel}
        onAIRetry={checkAIAvailability}
        onOpenAISettings={() => setAppSettingsOpen(true)}
      />

      <PaperDetailView
        paper={selectedPaper}
        isOpen={selectedPaperId !== null}
        onClose={() => setSelectedPaperId(null)}
        onReExtract={handleReExtract}
        onCopyText={(text) => {
          void navigator.clipboard.writeText(text)
          toast.success('Copied to clipboard')
        }}
        aiAvailable={aiState.isAvailable}
      />

      <Dialog open={appSettingsOpen} onOpenChange={setAppSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>PsycScholar Local</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              PDFs and extraction results are stored in this browser (IndexedDB). AI extraction now runs through the
              app&apos;s server-side cloud model, so the public deployment can process papers without local Ollama.
            </p>
            <p>
              The deployment needs a server-side Gemini API key and model configured. Once those environment variables
              are set, users can upload PDFs and run extraction directly from the hosted app.
            </p>
            <p>
              Adjust <strong className="text-foreground">Detail level</strong> before re-extracting or adding custom columns; newly uploaded papers use the current pipeline settings.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
