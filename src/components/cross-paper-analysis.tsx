import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  BarChart3, 
  Brain, 
  Compare, 
  FileText, 
  Lightbulb,
  Loader2,
  Copy,
  Download,
  TrendingUp,
  Users,
  Target
} from 'lucide-react'
import { type Paper, type ExtractedData } from '@/lib/database'
import { aiExtractionService } from '@/lib/ai-extraction'

interface CrossPaperAnalysisProps {
  isOpen: boolean
  onClose: () => void
  papers: Paper[]
  aiAvailable: boolean
}

interface AnalysisResult {
  success: boolean
  analysis?: string
  error?: string
  processingTime?: number
}

const analysisTemplates = [
  {
    id: 'methodology-comparison',
    name: 'Methodology Comparison',
    description: 'Compare research methods and designs',
    icon: <Compare className="h-4 w-4" />,
    question: 'Compare and contrast the methodologies used across these studies. Identify similarities and differences in research designs, sample characteristics, measurement approaches, and statistical analyses.'
  },
  {
    id: 'findings-synthesis',
    name: 'Findings Synthesis',
    description: 'Synthesize key findings and patterns',
    icon: <TrendingUp className="h-4 w-4" />,
    question: 'Synthesize the main findings across these studies. Identify consistent patterns, contradictions, and gaps in the research. What are the key takeaways from this body of work?'
  },
  {
    id: 'theoretical-contributions',
    name: 'Theoretical Contributions',
    description: 'Analyse theoretical implications',
    icon: <Lightbulb className="h-4 w-4" />,
    question: 'Analyse the theoretical contributions and implications across these studies. How do they advance the field? What theoretical frameworks are supported or challenged?'
  },
  {
    id: 'practical-applications',
    name: 'Practical Applications',
    description: 'Identify practical implications',
    icon: <Target className="h-4 w-4" />,
    question: 'Identify and analyse the practical applications and real-world implications of these findings. How can this research be applied in practice?'
  },
  {
    id: 'sample-characteristics',
    name: 'Sample Characteristics',
    description: 'Compare participant demographics',
    icon: <Users className="h-4 w-4" />,
    question: 'Compare and analyse the sample characteristics across these studies. Identify patterns in participant demographics, sample sizes, and population characteristics.'
  },
  {
    id: 'limitations-gaps',
    name: 'Limitations & Gaps',
    description: 'Identify research limitations and gaps',
    icon: <BarChart3 className="h-4 w-4" />,
    question: 'Identify common limitations across these studies and highlight gaps in the research literature. What are the methodological constraints and what future research is needed?'
  }
]

export function CrossPaperAnalysis({ isOpen, onClose, papers, aiAvailable }: CrossPaperAnalysisProps) {
  const [selectedPapers, setSelectedPapers] = useState<string[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [customQuestion, setCustomQuestion] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const papersWithData = papers.filter(p => p.extractedData)

  const handlePaperToggle = (paperId: string) => {
    setSelectedPapers(prev => 
      prev.includes(paperId) 
        ? prev.filter(id => id !== paperId)
        : [...prev, paperId]
    )
  }

  const handleSelectAll = () => {
    if (selectedPapers.length === papersWithData.length) {
      setSelectedPapers([])
    } else {
      setSelectedPapers(papersWithData.map(p => p.id!))
    }
  }

  const handleAnalyze = async () => {
    if (selectedPapers.length < 2) {
      alert('Please select at least 2 papers for analysis.')
      return
    }

    const question = selectedTemplate 
      ? analysisTemplates.find(t => t.id === selectedTemplate)?.question || customQuestion
      : customQuestion

    if (!question?.trim()) {
      alert('Please select an analysis template or enter a custom question')
      return
    }

    setIsAnalyzing(true)
    setAnalysisResult(null)

    try {
      const analysisPapers = papers
        .filter(p => selectedPapers.includes(p.id!))
        .map(p => ({
          title: p.title || p.fileName,
          authors: p.authors || 'Unknown',
          year: p.year || 0,
          extractedData: p.extractedData as ExtractedData
        }))

      const result = await aiExtractionService.performCrossPaperAnalysis(analysisPapers, question)
      
      setAnalysisResult({
        success: result.success,
        analysis: result.analysis,
        error: result.error
      })
    } catch (error) {
      setAnalysisResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCopyAnalysis = () => {
    if (analysisResult?.analysis) {
      navigator.clipboard.writeText(analysisResult.analysis)
    }
  }

  const handleDownloadAnalysis = () => {
    if (analysisResult?.analysis) {
      const blob = new Blob([analysisResult.analysis], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'cross-paper-analysis.txt'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const selectedTemplateData = analysisTemplates.find(t => t.id === selectedTemplate)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Cross-Paper Analysis
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="h-full p-6">
            <div className="space-y-6">
              {/* Paper Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-medium">Select papers to analyse</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs"
                  >
                    {selectedPapers.length === papersWithData.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="text-xs text-muted-foreground mb-2">
                  {papersWithData.length} papers with extracted data available
                </div>

                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {papersWithData.map((paper) => (
                    <Card 
                      key={paper.id} 
                      className={`p-3 cursor-pointer transition-colors ${
                        selectedPapers.includes(paper.id!) 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/30'
                      }`}
                      onClick={() => handlePaperToggle(paper.id!)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-1">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            selectedPapers.includes(paper.id!) 
                              ? 'bg-primary border-primary' 
                              : 'border-muted-foreground'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate">{paper.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {paper.authors} • {paper.year}
                          </div>
                          {paper.extractedData && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              Data Available
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {papersWithData.length < 2 && (
                  <div className="text-center py-4">
                    <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Need at least 2 papers with extracted data for analysis
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Analysis Type */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Analysis Type</Label>
                
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {analysisTemplates.map((template) => (
                    <Card
                      key={template.id}
                      className={`p-3 cursor-pointer transition-colors ${
                        selectedTemplate === template.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/30'
                      }`}
                      onClick={() => setSelectedTemplate(template.id)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-primary">{template.icon}</div>
                        <span className="font-medium text-sm">{template.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    </Card>
                  ))}
                </div>

                {/* Custom Question */}
                <div>
                  <Label htmlFor="customQuestion" className="text-sm font-medium">
                    Custom Analysis Question
                  </Label>
                  <Textarea
                    id="customQuestion"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="Ask a specific question about these papers..."
                    rows={3}
                    className="mt-2"
                  />
                </div>

                {/* Template Preview */}
                {selectedTemplateData && (
                  <Card className="p-3 bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-primary">{selectedTemplateData.icon}</div>
                      <span className="font-medium text-sm">Analysis Question:</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedTemplateData.question}
                    </p>
                  </Card>
                )}
              </div>

              <Separator />

              {/* Analysis Result */}
              {(analysisResult || isAnalyzing) && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">Analysis Results</Label>
                    {analysisResult?.success && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyAnalysis}
                          className="text-xs"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadAnalysis}
                          className="text-xs"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    )}
                  </div>

                  <Card className="p-4">
                    {isAnalyzing ? (
                      <div className="flex items-center gap-3 py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <div>
                          <div className="font-medium">Analysing papers…</div>
                          <div className="text-sm text-muted-foreground">
                            This may take a few minutes
                          </div>
                        </div>
                      </div>
                    ) : analysisResult?.success ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            Analysis Complete
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm">
                          {analysisResult.analysis}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600">
                        <div className="w-4 h-4 rounded-full bg-red-600" />
                        <span className="text-sm font-medium">
                          {analysisResult?.error || 'Analysis failed'}
                        </span>
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleAnalyze}
                  disabled={!aiAvailable || selectedPapers.length < 2 || isAnalyzing}
                  className="flex-1"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analysing…
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Analyse papers
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={onClose} disabled={isAnalyzing}>
                  Close
                </Button>
              </div>

              {/* Help Text */}
              <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
                <div className="font-medium mb-1">Tips:</div>
                <ul className="space-y-1">
                  <li>• Select 2-5 papers for best results</li>
                  <li>• Papers must have extracted data for analysis</li>
                  <li>• Choose a template or ask a custom question</li>
                  <li>• Analysis may take several minutes to complete</li>
                </ul>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
