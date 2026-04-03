"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  Download, 
  Table, 
  Code, 
  BookOpen,
  Loader2,
  FileSpreadsheet,
  FileType
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf/dist/jspdf.es.min.js'
import { type Paper, type ExtractedData } from '@/lib/database'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  papers: Paper[]
  customFields: CustomFieldDefinition[]
}

interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf' | 'json' | 'apa'
  includeMetadata: boolean
  includeFullText: boolean
  includeCustomFields: boolean
  selectedPapers: string[]
  selectedFields: string[]
}

function paperKey(p: { id?: string | number }) {
  return String(p.id ?? '')
}

export function ExportDialog({ isOpen, onClose, papers, customFields }: ExportDialogProps) {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'xlsx',
    includeMetadata: true,
    includeFullText: false,
    includeCustomFields: true,
    selectedPapers: [],
    selectedFields: ['background', 'theory', 'methodology', 'measures', 'results', 'implications', 'limitations']
  })
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setExportOptions(prev => ({
      ...prev,
      selectedPapers: papers.map(p => paperKey(p))
    }))
  }, [isOpen, papers])

  const coreFields = [
    { id: 'background', label: 'Background' },
    { id: 'theory', label: 'Theory' },
    { id: 'methodology', label: 'Methodology' },
    { id: 'measures', label: 'Measures' },
    { id: 'results', label: 'Results' },
    { id: 'implications', label: 'Implications' },
    { id: 'limitations', label: 'Limitations' }
  ]

  const getFieldValue = (paper: Paper, fieldId: string): string => {
    const ex = paper.extractedData
    if (!ex) return ''
    const isCore = coreFields.some(c => c.id === fieldId)
    if (isCore) return String((ex as unknown as Record<string, unknown>)[fieldId] ?? '')
    return String(ex.customFields?.[fieldId] ?? '')
  }

  const handlePaperToggle = (paperId: string) => {
    const id = String(paperId)
    setExportOptions(prev => ({
      ...prev,
      selectedPapers: prev.selectedPapers.includes(id)
        ? prev.selectedPapers.filter(x => x !== id)
        : [...prev.selectedPapers, id]
    }))
  }

  const handleFieldToggle = (fieldId: string) => {
    setExportOptions(prev => ({
      ...prev,
      selectedFields: prev.selectedFields.includes(fieldId)
        ? prev.selectedFields.filter(id => id !== fieldId)
        : [...prev.selectedFields, fieldId]
    }))
  }

  const handleSelectAllPapers = () => {
    setExportOptions(prev => ({
      ...prev,
      selectedPapers: prev.selectedPapers.length === papers.length
        ? []
        : papers.map(p => paperKey(p))
    }))
  }

  const handleSelectAllFields = () => {
    const allFields = [...coreFields.map(f => f.id), ...customFields.map(f => f.id)]
    setExportOptions(prev => ({
      ...prev,
      selectedFields: prev.selectedFields.length === allFields.length
        ? []
        : allFields
    }))
  }

  const generateCSV = () => {
    const selectedPapersData = papers.filter(p => exportOptions.selectedPapers.includes(paperKey(p)))
    
    // Headers
    let csv = 'Title,Authors,Year,Journal,DOI'
    
    // Add field headers
    exportOptions.selectedFields.forEach(fieldId => {
      const field = coreFields.find(f => f.id === fieldId) || customFields.find(f => f.id === fieldId)
      if (field) {
        const title = 'label' in field ? field.label : field.name
        csv += `,"${title}"`
      }
    })
    
    // Add metadata headers
    if (exportOptions.includeMetadata) {
      csv += ',File Name,File Size,Upload Date,Processing Status'
    }
    
    csv += '\n'
    
    // Data rows
    selectedPapersData.forEach(paper => {
      let row = `"${paper.title}","${paper.authors || ''}",${paper.year || ''},"${paper.journal || ''}","${paper.doi || ''}"`
      
      // Add field data
      exportOptions.selectedFields.forEach(fieldId => {
        const value = getFieldValue(paper, fieldId)
        const cleanValue = value.replace(/"/g, '""')
        row += `,"${cleanValue}"`
      })
      
      // Add metadata
      if (exportOptions.includeMetadata) {
        const uploadDate = new Date(paper.uploadedAt).toLocaleDateString()
        row += `,"${paper.fileName}","${paper.fileSize}","${uploadDate}","${paper.processingStatus}"`
      }
      
      row += '\n'
      csv += row
    })
    
    return csv
  }

  const generateJSON = () => {
    const selectedPapersData = papers.filter(p => exportOptions.selectedPapers.includes(paperKey(p)))
    
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalPapers: selectedPapersData.length,
        format: 'PsycScholar Export v1.3',
        options: exportOptions
      },
      papers: selectedPapersData.map(paper => {
        const paperData: any = {
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          journal: paper.journal,
          doi: paper.doi,
          abstract: paper.abstract
        }
        
        // Add extracted fields
        if (paper.extractedData) {
          exportOptions.selectedFields.forEach(fieldId => {
            paperData[fieldId] = (paper.extractedData as any)[fieldId]
          })
        }
        
        // Add metadata
        if (exportOptions.includeMetadata) {
          paperData.metadata = {
            fileName: paper.fileName,
            fileSize: paper.fileSize,
            fileType: paper.fileType,
            uploadedAt: paper.uploadedAt,
            processedAt: paper.processedAt,
            processingStatus: paper.processingStatus
          }
        }
        
        // Add full text
        if (exportOptions.includeFullText) {
          paperData.fullText = paper.fullText
        }
        
        return paperData
      })
    }
    
    return JSON.stringify(exportData, null, 2)
  }

  const generateAPA = () => {
    const selectedPapersData = papers.filter(p => exportOptions.selectedPapers.includes(paperKey(p)))
    
    let apa = 'PsycScholar Export - APA References\n'
    apa += 'Generated: ' + new Date().toLocaleDateString() + '\n'
    apa += 'Total Papers: ' + selectedPapersData.length + '\n\n'
    
    apa += '=== REFERENCES ===\n\n'
    
    selectedPapersData.forEach(paper => {
      let reference = ''
      
      // Authors
      if (paper.authors) {
        const authors = paper.authors.split(',').map(a => a.trim())
        if (authors.length <= 2) {
          reference += authors.join(' & ')
        } else {
          reference += authors[0] + ', et al.'
        }
      }
      
      // Year
      if (paper.year) {
        reference += ` (${paper.year}). `
      }
      
      // Title
      reference += paper.title ? paper.title + '. ' : ''
      
      // Journal
      if (paper.journal) {
        reference += `*${paper.journal}*. `
      }
      
      // DOI
      if (paper.doi) {
        reference += `https://doi.org/${paper.doi}`
      }
      
      apa += reference + '\n\n'
      
      // Add extracted summary if available
      if (paper.extractedData && exportOptions.selectedFields.length > 0) {
        apa += '--- Key Findings ---\n'
        exportOptions.selectedFields.forEach(fieldId => {
          const field = coreFields.find(f => f.id === fieldId)
          if (field && (paper.extractedData as any)[fieldId]) {
            const value = (paper.extractedData as any)[fieldId]
            apa += `**${field.label}:** ${value}\n\n`
          }
        })
        apa += '\n'
      }
    })
    
    return apa
  }

  const generateXLSX = () => {
    const selectedPapersData = papers.filter(p => exportOptions.selectedPapers.includes(paperKey(p)))
    const headers: string[] = ['Title', 'Authors', 'Year', 'Journal', 'DOI']
    exportOptions.selectedFields.forEach(fieldId => {
      const field = coreFields.find(f => f.id === fieldId) || customFields.find(f => f.id === fieldId)
      if (field) headers.push('label' in field ? field.label : field.name)
    })
    if (exportOptions.includeMetadata) {
      headers.push('File Name', 'File Size', 'Upload Date', 'Processing Status')
    }

    const rows: (string | number)[][] = [headers]
    selectedPapersData.forEach(paper => {
      const row: (string | number)[] = [
        paper.title || '',
        paper.authors || '',
        paper.year ?? '',
        paper.journal || '',
        paper.doi || ''
      ]
      exportOptions.selectedFields.forEach(fieldId => {
        row.push(getFieldValue(paper, fieldId))
      })
      if (exportOptions.includeMetadata) {
        row.push(
          paper.fileName,
          paper.fileSize,
          new Date(paper.uploadedAt).toLocaleDateString(),
          paper.processingStatus
        )
      }
      rows.push(row)
    })

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Papers')
    const fname = `psycscholar-export-${new Date().toISOString().split('T')[0]}.xlsx`
    XLSX.writeFile(wb, fname)
  }

  const generatePDF = () => {
    const selectedPapersData = papers.filter(p => exportOptions.selectedPapers.includes(paperKey(p)))
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageH = doc.internal.pageSize.getHeight()
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 40
    const maxW = pageW - 2 * margin
    let y = margin

    doc.setFontSize(11)
    doc.text(`PsycScholar — ${new Date().toLocaleString()}`, margin, y)
    y += 22

    selectedPapersData.forEach((paper, idx) => {
      const title = `${idx + 1}. ${paper.title || paper.fileName}`
      doc.setFontSize(10)
      doc.splitTextToSize(title, maxW).forEach((line: string) => {
        if (y > pageH - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 13
      })
      y += 4

      const meta = `Authors: ${paper.authors || '—'}    Year: ${paper.year ?? '—'}`
      doc.splitTextToSize(meta, maxW).forEach((line: string) => {
        if (y > pageH - margin) {
          doc.addPage()
          y = margin
        }
        doc.text(line, margin, y)
        y += 12
      })
      y += 6

      exportOptions.selectedFields.forEach(fieldId => {
        const label =
          coreFields.find(f => f.id === fieldId)?.label ||
          customFields.find(f => f.id === fieldId)?.name ||
          fieldId
        const text = `${label}: ${getFieldValue(paper, fieldId)}`
        doc.setFontSize(9)
        doc.splitTextToSize(text, maxW).forEach((line: string) => {
          if (y > pageH - margin) {
            doc.addPage()
            y = margin
          }
          doc.text(line, margin, y)
          y += 11
        })
        y += 4
      })

      y += 14
      if (y > pageH - margin) {
        doc.addPage()
        y = margin
      }
    })

    const fname = `psycscholar-export-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fname)
  }

  const handleExport = async () => {
    if (exportOptions.selectedPapers.length === 0) {
      alert('Please select at least one paper to export')
      return
    }
    
    setIsExporting(true)
    
    try {
      if (exportOptions.format === 'xlsx') {
        generateXLSX()
        onClose()
        return
      }
      if (exportOptions.format === 'pdf') {
        generatePDF()
        onClose()
        return
      }

      let content = ''
      let filename = ''
      let mimeType = ''

      switch (exportOptions.format) {
        case 'csv':
          content = generateCSV()
          filename = `psycscholar-export-${new Date().toISOString().split('T')[0]}.csv`
          mimeType = 'text/csv;charset=utf-8'
          break
        case 'json':
          content = generateJSON()
          filename = `psycscholar-export-${new Date().toISOString().split('T')[0]}.json`
          mimeType = 'application/json'
          break
        case 'apa':
          content = generateAPA()
          filename = `psycscholar-apa-${new Date().toISOString().split('T')[0]}.txt`
          mimeType = 'text/plain'
          break
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      onClose()
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const getFormatDescription = () => {
    switch (exportOptions.format) {
      case 'csv':
        return 'Comma-separated values; opens in Excel'
      case 'xlsx':
        return 'Excel workbook (.xlsx)'
      case 'pdf':
        return 'PDF report (one section per paper)'
      case 'json':
        return 'Structured data format for developers'
      case 'apa':
        return 'APA references with extracted findings'
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Papers
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="h-full p-6">
            <div className="space-y-6">
              {/* Format Selection */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Export Format</Label>
                <Select value={exportOptions.format} onValueChange={(value: any) => setExportOptions(prev => ({ ...prev, format: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Excel (.xlsx)</div>
                          <div className="text-xs text-muted-foreground">Best for spreadsheet editing</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <Table className="h-4 w-4" />
                        <div>
                          <div className="font-medium">CSV</div>
                          <div className="text-xs text-muted-foreground">Plain tabular text</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="pdf">
                      <div className="flex items-center gap-2">
                        <FileType className="h-4 w-4" />
                        <div>
                          <div className="font-medium">PDF</div>
                          <div className="text-xs text-muted-foreground">Printable / easy to share</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        <div>
                          <div className="font-medium">JSON</div>
                          <div className="text-xs text-muted-foreground">Structured data</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="apa">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        <div>
                          <div className="font-medium">APA Format</div>
                          <div className="text-xs text-muted-foreground">References & findings</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{getFormatDescription()}</p>
              </div>

              {/* Paper Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Select Papers ({exportOptions.selectedPapers.length} selected)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllPapers}
                    className="text-xs"
                  >
                    {exportOptions.selectedPapers.length === papers.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {papers.map((paper) => (
                    <Card 
                      key={paperKey(paper)} 
                      className={`p-3 cursor-pointer transition-colors ${
                        exportOptions.selectedPapers.includes(paperKey(paper)) 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/30'
                      }`}
                      onClick={() => handlePaperToggle(paperKey(paper))}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-1">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            exportOptions.selectedPapers.includes(paperKey(paper)) 
                              ? 'bg-primary border-primary' 
                              : 'border-muted-foreground'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate">{paper.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {paper.authors} • {paper.year}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Field Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Fields to Export ({exportOptions.selectedFields.length} selected)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllFields}
                    className="text-xs"
                  >
                    {exportOptions.selectedFields.length === coreFields.length + customFields.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="font-medium text-xs text-muted-foreground">Core Fields</div>
                  <div className="grid grid-cols-2 gap-2">
                    {coreFields.map((field) => (
                      <div key={field.id} className="flex items-center gap-2 p-2 rounded border">
                        <Checkbox
                          id={field.id}
                          checked={exportOptions.selectedFields.includes(field.id)}
                          onCheckedChange={() => handleFieldToggle(field.id)}
                        />
                        <Label htmlFor={field.id} className="text-sm cursor-pointer">
                          {field.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  
                  {customFields.length > 0 && (
                    <>
                      <div className="font-medium text-xs text-muted-foreground mt-3">Custom Fields</div>
                      <div className="grid grid-cols-2 gap-2">
                        {customFields.map((field) => (
                          <div key={field.id} className="flex items-center gap-2 p-2 rounded border">
                            <Checkbox
                              id={field.id}
                              checked={exportOptions.selectedFields.includes(field.id)}
                              onCheckedChange={() => handleFieldToggle(field.id)}
                            />
                            <Label htmlFor={field.id} className="text-sm cursor-pointer">
                              {field.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Export Options */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Additional Options</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="includeMetadata"
                      checked={exportOptions.includeMetadata}
                      onCheckedChange={(checked: boolean) => 
                        setExportOptions(prev => ({ ...prev, includeMetadata: checked }))
                      }
                    />
                    <Label htmlFor="includeMetadata" className="text-sm cursor-pointer">
                      Include metadata (file info, dates, status)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="includeFullText"
                      checked={exportOptions.includeFullText}
                      onCheckedChange={(checked: boolean) => 
                        setExportOptions(prev => ({ ...prev, includeFullText: checked }))
                      }
                    />
                    <Label htmlFor="includeFullText" className="text-sm cursor-pointer">
                      Include full text (JSON format only)
                    </Label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleExport}
                  disabled={exportOptions.selectedPapers.length === 0 || isExporting}
                  className="flex-1"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Export {exportOptions.format === 'xlsx' ? 'Excel' : exportOptions.format.toUpperCase()}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={onClose} disabled={isExporting}>
                  Cancel
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
