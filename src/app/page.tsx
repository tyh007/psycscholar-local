"use client"

import { useState, useEffect, useCallback } from 'react'
import { type Session } from '@supabase/supabase-js'
import { Sidebar } from '@/components/sidebar'
import { ResizableSidebar } from '@/components/resizable-sidebar'
import { MainContent } from '@/components/main-content'
import { PaperDetailView } from '@/components/paper-detail-view'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useAIExtraction } from '@/hooks/use-ai-extraction'
import { db, type Project, type Paper, type ExtractedData, type CustomField } from '@/lib/database'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'
import { PSYCHOLOGY_CUSTOM_FIELDS } from '@/lib/prompt-builder'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_OLLAMA_SETTINGS } from '@/lib/ollama-settings'

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
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [activeProject, setActiveProject] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [projectCustomFields, setProjectCustomFields] = useState<CustomFieldDefinition[]>([])
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [ollamaBaseUrlInput, setOllamaBaseUrlInput] = useState(DEFAULT_OLLAMA_SETTINGS.baseUrl)
  const [viewMode, setViewMode] = useState<'library' | 'trash'>('library')
  const [trashCount, setTrashCount] = useState(0)
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth)

  const { uploadFiles } = useFileUpload()
  const {
    aiState,
    checkAIAvailability,
    setCurrentModel,
    setBaseUrl,
    detailLevel,
    setDetailLevel,
    extractionJobs,
    getActiveJobsCount,
    extractFromPaper,
    extractCustomField
  } = useAIExtraction()

  useEffect(() => {
    setOllamaBaseUrlInput(aiState.baseUrl)
  }, [aiState.baseUrl])

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
    const supabase = getSupabaseBrowserClient()

    const bootstrapAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        setSession(data.session)
      } finally {
        setAuthLoading(false)
      }
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    bootstrapAuth()
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const initializeApp = async () => {
      if (!session) {
        setProjects([])
        setPapers([])
        setActiveProject(null)
        setProjectCustomFields([])
        setTrashCount(0)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        await checkAIAvailability()
        const projectList = await db.getProjects()
        setProjects(projectList)
        if (projectList.length > 0) {
          setActiveProject(prev => prev && projectList.some(project => project.id === prev) ? prev : projectList[0].id!)
        } else {
          setActiveProject(null)
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
        toast.error('Failed to initialize application')
      } finally {
        setIsLoading(false)
      }
    }

    void initializeApp()
  }, [session, checkAIAvailability])

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

  const handleBatchDelete = async (paperIds: string[]) => {
    if (paperIds.length === 0) return
    try {
      await Promise.all(paperIds.map(id => db.deletePaper(id)))
      await refreshList()
      if (selectedPaperId && paperIds.includes(String(selectedPaperId))) {
        setSelectedPaperId(null)
      }
      toast.success(`Permanently deleted ${paperIds.length} paper${paperIds.length > 1 ? 's' : ''}`)
    } catch (error) {
      console.error(error)
      toast.error('Could not delete papers')
    }
  }

  const handleBatchRestore = async (paperIds: string[]) => {
    if (paperIds.length === 0) return
    try {
      await Promise.all(paperIds.map(id => db.restorePaperFromTrash(id)))
      await refreshList()
      toast.success(`Restored ${paperIds.length} paper${paperIds.length > 1 ? 's' : ''} to paper list`)
    } catch (error) {
      console.error(error)
      toast.error('Could not restore papers')
    }
  }

  const handleClearAllTrash = async () => {
    try {
      const trashPapers = papers.filter(p => p.inTrash)
      await Promise.all(trashPapers.map(p => db.deletePaper(String(p.id))))
      await refreshList()
      toast.success('Recycle bin cleared')
    } catch (error) {
      console.error(error)
      toast.error('Could not clear recycle bin')
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

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md p-6">
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Sign in to PsycScholar</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your projects and papers are now private to your account. Enter your email and we&apos;ll send you a secure magic link.
              </p>
            </div>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button
              className="w-full"
              disabled={authSubmitting || !email.trim()}
              onClick={async () => {
                try {
                  setAuthSubmitting(true)
                  const supabase = getSupabaseBrowserClient()
                  const { error } = await supabase.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
                    }
                  })
                  if (error) throw error
                  toast.success('Magic link sent. Check your email to sign in.')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Could not send sign-in email')
                } finally {
                  setAuthSubmitting(false)
                }
              }}
            >
              {authSubmitting ? 'Sending link...' : 'Send magic link'}
            </Button>
          </div>
        </Card>
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
          userEmail={session.user.email}
          onSignOut={() => {
            void getSupabaseBrowserClient().auth.signOut()
          }}
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
        onPaperBatchDelete={handleBatchDelete}
        onPaperBatchRestore={handleBatchRestore}
        onPaperClearAllTrash={handleClearAllTrash}
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
            <DialogTitle>Local Ollama Setup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ollama URL</label>
              <Input
                value={ollamaBaseUrlInput}
                onChange={(event) => setOllamaBaseUrlInput(event.target.value)}
                placeholder="http://localhost:11434"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    setBaseUrl(ollamaBaseUrlInput)
                    await checkAIAvailability()
                    toast.success('Updated local Ollama settings')
                  }}
                >
                  Save and recheck
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOllamaBaseUrlInput(DEFAULT_OLLAMA_SETTINGS.baseUrl)}
                >
                  Reset
                </Button>
              </div>
            </div>
            <p>
              PsycScholar can call a local Ollama server directly from the browser, so each user can run extraction with their own local model and keep API keys out of the app.
            </p>
            <p>
              Setup guide for new users:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Install Ollama from <code className="bg-muted px-1 rounded">ollama.com</code> or with Homebrew.</li>
              <li>Pull a light model such as <code className="bg-muted px-1 rounded">ollama pull qwen2.5:3b</code>.</li>
              <li>Run <code className="bg-muted px-1 rounded">ollama serve</code> locally. For the hosted app, use <code className="bg-muted px-1 rounded">OLLAMA_ORIGINS=https://psycscholar-local.vercel.app ollama serve</code>.</li>
              <li>Open this dialog, confirm the Ollama URL, then choose a model from the AI status dropdown.</li>
            </ol>
            <p>
              Adjust <strong className="text-foreground">Detail level</strong> before re-extracting or adding custom columns; newly uploaded papers use the currently selected local model.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
