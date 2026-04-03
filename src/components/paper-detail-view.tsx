import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  FileText, 
  Eye, 
  Download, 
  Copy, 
  ExternalLink,
  Brain,
  RefreshCw,
  Settings,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react'
import { type Paper, type ExtractedData } from '@/lib/database'

interface PaperDetailViewProps {
  paper: Paper | null
  isOpen: boolean
  onClose: () => void
  onReExtract?: (paperId: string) => void
  onCopyText?: (text: string) => void
  aiAvailable?: boolean
}

export function PaperDetailView({ 
  paper, 
  isOpen, 
  onClose, 
  onReExtract,
  onCopyText,
  aiAvailable = false 
}: PaperDetailViewProps) {
  const [activeTab, setActiveTab] = useState('extracted')
  const [pdfScale, setPdfScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)

  const extractedData = paper?.extractedData
  const paperIdStr = paper?.id !== undefined ? String(paper.id) : ''

  const handleCopyField = (field: string, value: string) => {
    const text = `${field}:\n${value}`
    onCopyText?.(text)
  }

  const handleCopyAll = () => {
    if (!paper || !extractedData) return
    
    const allText = `
Title: ${paper.title}
Authors: ${paper.authors || 'Unknown'}
Year: ${paper.year || 'Unknown'}
Journal: ${paper.journal || 'Unknown'}

Background:
${(extractedData.background as string) || 'Not extracted'}

Theory & Hypotheses:
${(extractedData.theory as string) || 'Not extracted'}

Methodology:
${(extractedData.methodology as string) || 'Not extracted'}

Measures:
${(extractedData.measures as string) || 'Not extracted'}

Results:
${(extractedData.results as string) || 'Not extracted'}

Implications:
${(extractedData.implications as string) || 'Not extracted'}

Limitations:
${(extractedData.limitations as string) || 'Not extracted'}
    `.trim()
    
    onCopyText?.(allText)
  }

  const renderExtractedField = (title: string, field: keyof ExtractedData, value?: string) => {
    if (!paper) return null
    const fieldValue = value || (extractedData?.[field] as string) || 'Not extracted'
    
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">{title}</h3>
          {onCopyText && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleCopyField(title, fieldValue)}
              title={`Copy ${title}`}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {fieldValue}
        </div>
      </Card>
    )
  }

  const renderPDFViewer = () => {
    if (!paper) return null
    // Placeholder for PDF viewer - in a real implementation, you would use react-pdf-viewer
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Page {currentPage} of ??
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfScale(Math.max(0.5, pdfScale - 0.25))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-12 text-center">
              {Math.round(pdfScale * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfScale(Math.min(3, pdfScale + 0.25))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPdfScale(1)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 flex items-center justify-center bg-muted/20 p-8">
          <div className="text-center">
            <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              PDF Viewer Coming Soon
            </p>
            <p className="text-sm text-muted-foreground">
              Full PDF viewing will be available in the next update
            </p>
            {paper.fullText && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCopyText?.(paper.fullText || '')}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Full Text
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        {!paper ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Could not load this paper. Close and try again.
          </div>
        ) : (
          <>
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold truncate">
                {paper.title || paper.fileName}
              </DialogTitle>
              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                <span>{paper.authors || 'Unknown authors'}</span>
                <span>•</span>
                <span>{paper.year || 'Unknown year'}</span>
                {paper.journal && (
                  <>
                    <span>•</span>
                    <span>{paper.journal}</span>
                  </>
                )}
                {paper.processingStatus === 'processing' && (
                  <Badge variant="secondary" className="gap-1">
                    <Brain className="h-3 w-3 animate-pulse" />
                    Processing
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {onReExtract && aiAvailable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReExtract(paperIdStr)}
                  disabled={paper.processingStatus === 'processing'}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-Extract
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </Button>
              {paper.doi && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`https://doi.org/${paper.doi}`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  DOI
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
              <TabsTrigger value="pdf">PDF Viewer</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full p-6">
                <TabsContent value="extracted" className="mt-0 space-y-4">
                  {extractedData ? (
                    <>
                      {renderExtractedField('Background', 'background')}
                      {renderExtractedField('Theory & Hypotheses', 'theory')}
                      {renderExtractedField('Methodology', 'methodology')}
                      {renderExtractedField('Measures & Scales', 'measures')}
                      {renderExtractedField('Results', 'results')}
                      {renderExtractedField('Implications', 'implications')}
                      {renderExtractedField('Limitations', 'limitations')}
                    </>
                  ) : (
                    <Card className="p-8 text-center">
                      <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                      <h3 className="font-semibold mb-2">No Extracted Data</h3>
                      <p className="text-muted-foreground mb-4">
                        This paper hasn't been processed with AI extraction yet.
                      </p>
                      {aiAvailable && onReExtract && (
                        <Button onClick={() => onReExtract(paperIdStr)}>
                          <Brain className="h-4 w-4 mr-2" />
                          Extract Data
                        </Button>
                      )}
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="pdf" className="mt-0 h-full">
                  {renderPDFViewer()}
                </TabsContent>

                <TabsContent value="metadata" className="mt-0 space-y-4">
                  <Card className="p-4">
                    <h3 className="font-semibold text-sm mb-3">File Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">File Name:</span>
                        <span>{paper.fileName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">File Size:</span>
                        <span>{(paper.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">File Type:</span>
                        <span>{paper.fileType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Uploaded:</span>
                        <span>{new Date(paper.uploadedAt).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Processed:</span>
                        <span>
                          {paper.processedAt 
                            ? new Date(paper.processedAt).toLocaleString()
                            : 'Not processed'
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={
                          paper.processingStatus === 'completed' ? 'default' :
                          paper.processingStatus === 'processing' ? 'secondary' :
                          paper.processingStatus === 'error' ? 'destructive' : 'outline'
                        }>
                          {paper.processingStatus}
                        </Badge>
                      </div>
                    </div>
                  </Card>

                  {paper.doi && (
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm mb-3">DOI</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {paper.doi}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`https://doi.org/${paper.doi}`, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </Card>
                  )}

                  {paper.abstract && (
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm mb-3">Abstract</h3>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {paper.abstract}
                      </div>
                    </Card>
                  )}

                  {paper.errorMessage && (
                    <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-950/20">
                      <h3 className="font-semibold text-sm mb-3 text-red-600">Processing Error</h3>
                      <div className="text-sm text-red-600">
                        {paper.errorMessage}
                      </div>
                    </Card>
                  )}
                </TabsContent>
              </ScrollArea>
            </div>
          </Tabs>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
