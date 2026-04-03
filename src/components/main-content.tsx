"use client"

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { AIStatusIndicator } from '@/components/ai-status'
import { ExtractionProgress } from '@/components/extraction-progress'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { ExportDialog } from '@/components/export-dialog'
import { CustomFieldManager } from '@/components/custom-field-manager'
import { 
  Upload, 
  Search, 
  Filter, 
  Plus, 
  Download,
  Eye,
  FileText,
  Brain,
  BarChart3,
  Trash2,
  RefreshCw,
  ArchiveRestore
} from 'lucide-react'
import { type Paper } from '@/lib/database'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'

type ColumnKey =
  | 'title'
  | 'authors'
  | 'year'
  | 'background'
  | 'theory'
  | 'methodology'
  | 'measures'
  | 'results'
  | 'implications'
  | 'limitations'
  | 'actions'

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  title: 240,
  authors: 180,
  year: 100,
  background: 180,
  theory: 180,
  methodology: 260,
  measures: 250,
  results: 180,
  implications: 180,
  limitations: 180,
  actions: 120,
}

const MIN_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  title: 180,
  authors: 140,
  year: 80,
  background: 160,
  theory: 160,
  methodology: 200,
  measures: 200,
  results: 160,
  implications: 160,
  limitations: 160,
  actions: 100,
}

const TABLE_COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'authors', label: 'Authors' },
  { key: 'year', label: 'Year' },
  { key: 'background', label: 'Background' },
  { key: 'theory', label: 'Theory' },
  { key: 'methodology', label: 'Methodology' },
  { key: 'measures', label: 'Measures' },
  { key: 'results', label: 'Results' },
  { key: 'implications', label: 'Implications' },
  { key: 'limitations', label: 'Limitations' },
  { key: 'actions', label: 'Actions' },
]

const GRID_DATA_COLUMNS = TABLE_COLUMNS.filter((c) => c.key !== 'actions')

function formatAuthorsForAPA(authors?: string): string {
  if (!authors?.trim()) return 'Unknown authors'

  const names = parseAuthorEntries(authors)
  const fallbackNames = names.length > 0 ? names : [authors.replace(/\s+/g, ' ').trim()]

  const surnames = fallbackNames
    .map(name => extractSurname(name))
    .filter(Boolean)

  if (surnames.length === 0) {
    return extractSurname(fallbackNames[0]) || authors
  }
  if (surnames.length === 1) return surnames[0]
  if (surnames.length === 2) return `${surnames[0]} & ${surnames[1]}`
  return `${surnames[0]} et al.`
}

function parseAuthorEntries(authors: string): string[] {
  const normalized = authors
    .replace(/[*†‡§¶0-9]+/g, ' ')
    .replace(/\s*&\s*/g, '; ')
    .replace(/\sand\s/gi, '; ')
    .replace(/,(?=\s*[A-Z])/g, ';')
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
    .split(';')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry =>
      entry
        .replace(/\b[A-Z]\.(?=\s|$)/g, ' ')
        .replace(/\b[A-Z](?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
}

function extractSurname(name: string): string {
  const cleaned = name
    .replace(/[*†‡§¶0-9]+/g, ' ')
    .replace(/([a-z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    const meaningfulParts = parts.filter(part => !/^[A-Z]\.?$/i.test(part))
    if (meaningfulParts.length >= 2) {
      const last = meaningfulParts[meaningfulParts.length - 1]
      const prev = meaningfulParts[meaningfulParts.length - 2]?.toLowerCase()
      if (prev === 'mc' || prev === 'mac') {
        return `${meaningfulParts[meaningfulParts.length - 2]}${last}`
      }
      if (['de', 'del', 'der', 'di', 'la', 'le', 'van', 'von', 'da', 'du'].includes(prev)) {
        return `${meaningfulParts[meaningfulParts.length - 2]} ${last}`
      }
      return last
    }
    return meaningfulParts[0] || parts[parts.length - 1]
  }

  const compact = (parts[0] || cleaned).replace(/\./g, '')

  const surnamePatterns = [
    /((?:Mc|Mac)[A-Z][a-zA-Z'’.-]+)$/,
    /(O'[A-Z][a-zA-Z'’.-]+)$/,
    /([A-Z][a-z]+(?:-[A-Z][a-z]+)?)$/
  ]

  for (const pattern of surnamePatterns) {
    const match = compact.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  const camelCaseSegments = compact.match(/[A-Z][a-zA-Z'’.-]*/g) || []
  if (camelCaseSegments.length >= 2) {
    const tail = camelCaseSegments.slice(1)
    const mcIndex = tail.findIndex(segment => /^(?:Mc|Mac)$/i.test(segment))
    if (mcIndex >= 0 && tail[mcIndex + 1]) {
      return `${tail[mcIndex]}${tail[mcIndex + 1]}`
    }

    const lastTwo = tail.slice(-2)
    if (lastTwo.length === 2 && /^[A-Z]$/.test(lastTwo[0])) {
      return lastTwo[1]
    }

    return tail[tail.length - 1]
  }

  return compact
}

interface MainContentProps {
  activeProject: string | null
  papers: Paper[]
  isTrashView?: boolean
  onBackFromTrash?: () => void
  onPaperUpload: (files: File[]) => void
  onPaperSelect: (paperId: string | number) => void
  onPaperMoveToTrash?: (paperId: string) => void
  onPaperRestore?: (paperId: string) => void
  onPaperPermanentDelete?: (paperId: string) => void
  onRefresh?: () => void
  aiState?: {
    isAvailable: boolean
    isChecking: boolean
    availableModels: string[]
    currentModel: string
    error?: string
  }
  globalDetailLevel?: number
  setGlobalDetailLevel?: (level: number) => void
  extractionJobs?: any[]
  activeExtractionJobs?: number
  customFieldDefinitions?: CustomFieldDefinition[]
  onAddCustomField?: (field: CustomFieldDefinition) => void | Promise<void>
  onUpdateCustomField?: (fieldId: string, updates: Partial<CustomFieldDefinition>) => void | Promise<void>
  onDeleteCustomField?: (fieldId: string) => void | Promise<void>
  onAddPsychologyFields?: () => void | Promise<void>
  onAIModelChange?: (model: string) => void
  onAIRetry?: () => void
  onOpenAISettings?: () => void
}

export function MainContent({ 
  activeProject, 
  papers, 
  isTrashView = false,
  onBackFromTrash,
  onPaperUpload, 
  onPaperSelect,
  onPaperMoveToTrash,
  onPaperRestore,
  onPaperPermanentDelete,
  onRefresh,
  aiState,
  globalDetailLevel = 50,
  setGlobalDetailLevel,
  extractionJobs,
  activeExtractionJobs = 0,
  customFieldDefinitions = [],
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onAddPsychologyFields,
  onAIModelChange,
  onAIRetry,
  onOpenAISettings
}: MainContentProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [detailLevel, setDetailLevel] = useState([globalDetailLevel]) // 0 = brief, 100 = detailed
  const [isDragging, setIsDragging] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [customFieldOpen, setCustomFieldOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterYearMin, setFilterYearMin] = useState('')
  const [filterYearMax, setFilterYearMax] = useState('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [appliedYearMin, setAppliedYearMin] = useState('')
  const [appliedYearMax, setAppliedYearMax] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [binDialogOpen, setBinDialogOpen] = useState(false)
  const [binTargetId, setBinTargetId] = useState<string | null>(null)
  const [confirmMoveToBin, setConfirmMoveToBin] = useState(false)
  const [permanentDialogOpen, setPermanentDialogOpen] = useState(false)
  const [permanentTargetId, setPermanentTargetId] = useState<string | null>(null)
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false)
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS)
  const resizeStateRef = useRef<{
    key: ColumnKey
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => {
    const savedWidths = window.localStorage.getItem('psycscholar-table-widths')
    if (!savedWidths) return

    try {
      const parsed = JSON.parse(savedWidths) as Partial<Record<ColumnKey, number>>
      setColumnWidths(prev => ({ ...prev, ...parsed }))
    } catch (error) {
      console.warn('Failed to restore table widths:', error)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('psycscholar-table-widths', JSON.stringify(columnWidths))
  }, [columnWidths])

  useEffect(() => {
    setDetailLevel([globalDetailLevel])
  }, [globalDetailLevel])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) return

      const deltaX = event.clientX - resizeState.startX
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTHS[resizeState.key],
        resizeState.startWidth + deltaX
      )

      setColumnWidths(prev => ({
        ...prev,
        [resizeState.key]: nextWidth
      }))
    }

    const handleMouseUp = () => {
      resizeStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = (key: ColumnKey, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    resizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth: columnWidths[key]
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type === 'application/pdf'
    )
    if (files.length > 0) {
      onPaperUpload(files)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onPaperUpload(files)
    }
    e.target.value = ''
  }

  const matchesContentKeyword = (paper: Paper, kw: string) => {
    if (!kw.trim()) return true
    const q = kw.toLowerCase()
    const blob = [
      paper.title,
      paper.authors,
      paper.fullText,
      paper.abstract,
      paper.extractedData?.background,
      paper.extractedData?.theory,
      paper.extractedData?.methodology,
      paper.extractedData?.measures,
      paper.extractedData?.results,
      paper.extractedData?.implications,
      paper.extractedData?.limitations,
      paper.extractedData?.customFields
        ? Object.values(paper.extractedData.customFields).join(' ')
        : ''
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return blob.includes(q)
  }

  const filteredPapers = papers.filter(paper => {
    const q = searchQuery.toLowerCase().trim()
    const searchOk =
      !q ||
      (paper.title || '').toLowerCase().includes(q) ||
      (paper.authors || '').toLowerCase().includes(q) ||
      (paper.fullText || '').toLowerCase().includes(q)

    if (!searchOk) return false

    const yMin = appliedYearMin.trim() ? parseInt(appliedYearMin, 10) : NaN
    const yMax = appliedYearMax.trim() ? parseInt(appliedYearMax, 10) : NaN
    const year = paper.year
    if (!Number.isNaN(yMin) && year !== undefined && year < yMin) return false
    if (!Number.isNaN(yMax) && year !== undefined && year > yMax) return false

    if (appliedKeyword.trim() && !matchesContentKeyword(paper, appliedKeyword)) return false

    return true
  })

  const customColWidth = 200
  const tableMinWidth =
    TABLE_COLUMNS.reduce((sum, column) => sum + columnWidths[column.key], 0) +
    customFieldDefinitions.length * customColWidth

  if (!activeProject) {
    return (
      <div className="flex-1 h-full flex items-center justify-center academic-gradient">
        <div className="text-center max-w-md">
          <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Welcome to PsycScholar
          </h2>
          <p className="text-muted-foreground mb-6">
            Select a project from the sidebar or create a new one to start analysing psychology papers.
          </p>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-3 justify-start">
              <Brain className="h-5 w-5 text-primary" />
              <span>Extract with cloud AI so teammates can use the app online</span>
            </div>
            <div className="flex items-center gap-3 justify-start">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span>Structured analysis of methodology, measures, and results</span>
            </div>
            <div className="flex items-center gap-3 justify-start">
              <Eye className="h-5 w-5 text-primary" />
              <span>Traceability back to original PDF sources</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col academic-gradient">
      {/* Header */}
      <div className="p-6 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {isTrashView && (
                <Button variant="ghost" size="sm" type="button" className="-ml-2" onClick={() => onBackFromTrash?.()}>
                  ← Back
                </Button>
              )}
              <h1 className="text-2xl font-semibold text-foreground">
                {isTrashView ? 'Recycle bin' : 'Papers'}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {isTrashView ? `${papers.length} in recycle bin` : `${papers.length} papers`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              type="button"
              title="Reload table from database"
              onClick={() => onRefresh?.()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {/* AI Status Indicator */}
            {aiState && !isTrashView && (
              <AIStatusIndicator 
                isAvailable={aiState.isAvailable}
                isChecking={aiState.isChecking}
                availableModels={aiState.availableModels || []}
                currentModel={aiState.currentModel}
                error={aiState.error}
                onModelChange={onAIModelChange}
                onRetryConnection={onAIRetry}
                onOpenSettings={onOpenAISettings}
              />
            )}
            {!isTrashView && (
              <>
            <Button type="button" onClick={() => {
              const input = document.getElementById('file-upload-main') as HTMLInputElement
              input?.click()
            }}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Paper
            </Button>
            <input
              id="file-upload-main"
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="detail-level" className="text-sm font-medium whitespace-nowrap">
                Detail Level:
              </Label>
              <div className="flex items-center gap-2 w-32">
                <span className="text-xs text-muted-foreground">Brief</span>
                <Slider
                  id="detail-level"
                  value={detailLevel}
                  onValueChange={(v) => {
                    setDetailLevel(v)
                    setGlobalDetailLevel?.(v[0])
                  }}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground">Detailed</span>
              </div>
            </div>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setFilterYearMin(appliedYearMin)
                setFilterYearMax(appliedYearMax)
                setFilterKeyword(appliedKeyword)
                setFilterOpen(true)
              }}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {(appliedYearMin || appliedYearMax || appliedKeyword) ? (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px]">on</span>
              ) : null}
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => setExportOpen(true)} disabled={papers.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, author, or content…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {!isTrashView && (
          <Button variant="outline" size="sm" type="button" onClick={() => setCustomFieldOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Column
          </Button>
          )}
        </div>
        
        {/* Extraction Progress */}
        {activeExtractionJobs > 0 && extractionJobs && extractionJobs.length > 0 && (
          <div className="mt-4">
            <ExtractionProgress jobs={extractionJobs} />
          </div>
        )}
      </div>

      {/* Upload Zone (when no papers, library only) */}
      {papers.length === 0 && !isTrashView && (
        <div className="flex-1 flex items-center justify-center p-8">
          <Card
            className={`w-full max-w-2xl p-8 border-2 border-dashed transition-all ${
              isDragging 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <Upload className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Upload Psychology Papers
              </h3>
              <p className="text-muted-foreground mb-6">
                Drag and drop PDF files here, or click to browse
              </p>
              <div className="flex gap-4 justify-center">
                <Button 
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('file-upload-empty') as HTMLInputElement
                    input?.click()
                  }}
                  className="flex items-center"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Select Files
                </Button>
                <input
                  id="file-upload-empty"
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
              <div className="mt-6 text-xs text-muted-foreground">
                <p>PDFs are parsed in the browser; AI extraction runs through the app&apos;s cloud backend</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {papers.length === 0 && isTrashView && (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          The recycle bin is empty. Items you remove from the paper list will appear here.
        </div>
      )}

      {/* Papers Table */}
      {papers.length > 0 && (
        <div className="flex-1 min-w-0 overflow-hidden p-6">
          <Card className="h-full min-w-0 overflow-hidden p-6 paper-card">
            <div className="h-full max-w-full overflow-x-auto overflow-y-auto rounded-lg border border-border overscroll-contain">
              <table className="w-full table-fixed psyc-grid" style={{ minWidth: `${tableMinWidth}px` }}>
                <thead className="sticky top-0 bg-background border-b border-border">
                  <tr>
                    {GRID_DATA_COLUMNS.map(column => (
                      <th
                        key={column.key}
                        className="relative text-left p-4 pr-6 font-medium text-sm text-muted-foreground"
                        style={{ width: `${columnWidths[column.key]}px` }}
                      >
                        {column.label}
                        <button
                          type="button"
                          aria-label={`Resize ${column.label} column`}
                          className="absolute top-0 right-0 h-full w-3 cursor-col-resize border-r border-transparent transition hover:border-border hover:bg-muted/40"
                          onMouseDown={(event) => handleResizeStart(column.key, event)}
                        />
                      </th>
                    ))}
                    {customFieldDefinitions.map((cf) => (
                      <th
                        key={cf.id}
                        className="text-left p-4 font-medium text-sm text-muted-foreground"
                        style={{ width: `${customColWidth}px` }}
                      >
                        {cf.name}
                      </th>
                    ))}
                    <th
                      className="relative text-left p-4 pr-6 font-medium text-sm text-muted-foreground"
                      style={{ width: `${columnWidths.actions}px` }}
                    >
                      Actions
                      <button
                        type="button"
                        aria-label="Resize Actions column"
                        className="absolute top-0 right-0 h-full w-3 cursor-col-resize border-r border-transparent transition hover:border-border hover:bg-muted/40"
                        onMouseDown={(event) => handleResizeStart('actions', event)}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPapers.map((paper, index) => (
                    <tr key={`${paper.id}-${paper.extractedData?.background ? 'with-data' : 'no-data'}-${index}`} className="border-b border-border align-top hover:bg-muted/30">
                      <td className="p-4 align-top" style={{ width: `${columnWidths.title}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm font-medium whitespace-normal break-words leading-6">{paper.title || paper.fileName}</p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.authors}px` }}>
                        <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                          {formatAuthorsForAPA(paper.authors)}
                        </p>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.year}px` }}>
                        <p className="text-sm leading-6">{paper.year || 'Unknown'}</p>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.background}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.background || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.theory}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.theory || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.methodology}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.methodology || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.measures}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.measures || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.results}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.results || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.implications}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.implications || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      <td className="p-4 align-top" style={{ width: `${columnWidths.limitations}px` }}>
                        <div className="max-w-full">
                          <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                            {paper.extractedData?.limitations || 'Not extracted'}
                          </p>
                        </div>
                      </td>
                      {customFieldDefinitions.map((cf) => (
                        <td
                          key={cf.id}
                          className="p-4 align-top"
                          style={{ width: `${customColWidth}px` }}
                        >
                          <div className="max-w-full">
                            <p className="text-sm text-muted-foreground whitespace-normal break-words leading-6">
                              {paper.extractedData?.customFields?.[cf.id] || 'Not extracted'}
                            </p>
                          </div>
                        </td>
                      ))}
                      <td className="p-4 align-top" style={{ width: `${columnWidths.actions}px` }}>
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            title="View details"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (paper.id !== undefined) onPaperSelect(paper.id)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!isTrashView && onPaperMoveToTrash && (
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              title="Move to recycle bin"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (paper.id !== undefined) {
                                  setBinTargetId(String(paper.id))
                                  setConfirmMoveToBin(false)
                                  setBinDialogOpen(true)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {isTrashView && onPaperRestore && (
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              title="Restore"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (paper.id !== undefined) onPaperRestore(String(paper.id))
                              }}
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                          {isTrashView && onPaperPermanentDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              title="Delete permanently"
                              className="text-red-600 hover:text-red-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (paper.id !== undefined) {
                                  setPermanentTargetId(String(paper.id))
                                  setConfirmPermanentDelete(false)
                                  setPermanentDialogOpen(true)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter papers</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="filter-year-min">Year from</Label>
                <Input
                  id="filter-year-min"
                  inputMode="numeric"
                  placeholder="e.g. 2018"
                  value={filterYearMin}
                  onChange={(e) => setFilterYearMin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-year-max">Year to</Label>
                <Input
                  id="filter-year-max"
                  inputMode="numeric"
                  placeholder="e.g. 2024"
                  value={filterYearMax}
                  onChange={(e) => setFilterYearMax(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-keyword">Keywords in full text / extraction</Label>
              <Input
                id="filter-keyword"
                placeholder="Extra filter (optional)"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Applied together with the search box above. Leave years empty to ignore.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilterYearMin('')
                setFilterYearMax('')
                setFilterKeyword('')
                setAppliedYearMin('')
                setAppliedYearMax('')
                setAppliedKeyword('')
                setFilterOpen(false)
              }}
            >
              Clear all
            </Button>
            <Button
              type="button"
              onClick={() => {
                setAppliedYearMin(filterYearMin)
                setAppliedYearMax(filterYearMax)
                setAppliedKeyword(filterKeyword)
                setFilterOpen(false)
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportDialog
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        papers={papers}
        customFields={customFieldDefinitions}
      />

      <Dialog open={binDialogOpen} onOpenChange={setBinDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move to recycle bin</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This paper will be moved to the recycle bin. Open the recycle bin from the sidebar to restore it or delete it permanently.
          </p>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="confirm-bin"
              checked={confirmMoveToBin}
              onCheckedChange={(v) => setConfirmMoveToBin(v === true)}
            />
            <Label htmlFor="confirm-bin" className="text-sm leading-snug">
              I confirm I want to move this paper to the recycle bin
            </Label>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setBinDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!confirmMoveToBin || !binTargetId}
              onClick={() => {
                if (binTargetId && onPaperMoveToTrash) {
                  onPaperMoveToTrash(binTargetId)
                }
                setBinDialogOpen(false)
                setBinTargetId(null)
                setConfirmMoveToBin(false)
              }}
            >
              Move to recycle bin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={permanentDialogOpen} onOpenChange={setPermanentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete permanently</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. The paper record and locally stored parsed data will be removed.
          </p>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="confirm-permanent"
              checked={confirmPermanentDelete}
              onCheckedChange={(v) => setConfirmPermanentDelete(v === true)}
            />
            <Label htmlFor="confirm-permanent" className="text-sm leading-snug">
              I confirm I want to delete this permanently
            </Label>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPermanentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmPermanentDelete || !permanentTargetId}
              onClick={() => {
                if (permanentTargetId && onPaperPermanentDelete) {
                  onPaperPermanentDelete(permanentTargetId)
                }
                setPermanentDialogOpen(false)
                setPermanentTargetId(null)
                setConfirmPermanentDelete(false)
              }}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomFieldManager
        isOpen={customFieldOpen}
        onClose={() => setCustomFieldOpen(false)}
        customFields={customFieldDefinitions}
        onAddField={async (field) => {
          await onAddCustomField?.(field)
        }}
        onUpdateField={async (fieldId, updates) => {
          await onUpdateCustomField?.(fieldId, updates)
        }}
        onDeleteField={async (fieldId) => {
          await onDeleteCustomField?.(fieldId)
        }}
        onAddPsychologyFields={async () => {
          await onAddPsychologyFields?.()
        }}
      />
    </div>
  )
}
