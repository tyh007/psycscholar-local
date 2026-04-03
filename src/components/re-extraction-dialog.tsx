import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  RefreshCw, 
  Brain, 
  Settings, 
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  Zap
} from 'lucide-react'
import { type Paper, type ExtractedData } from '@/lib/database'
import { type CustomFieldDefinition } from '@/lib/prompt-builder'

interface ReExtractionDialogProps {
  isOpen: boolean
  onClose: () => void
  paper: Paper | null
  onReExtract: (paperId: string, options: ReExtractionOptions) => Promise<void>
  aiAvailable: boolean
  customFields: CustomFieldDefinition[]
  isProcessing?: boolean
}

export interface ReExtractionOptions {
  fields: string[]
  detailLevel: 'brief' | 'detailed'
  customFields: string[]
  forceReExtract: boolean
}

export function ReExtractionDialog({
  isOpen,
  onClose,
  paper,
  onReExtract,
  aiAvailable,
  customFields,
  isProcessing = false
}: ReExtractionDialogProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [selectedCustomFields, setSelectedCustomFields] = useState<string[]>([])
  const [detailLevel, setDetailLevel] = useState<'brief' | 'detailed'>('brief')
  const [forceReExtract, setForceReExtract] = useState(false)

  const coreFields = [
    { id: 'background', label: 'Background', description: 'Research context and problem statement' },
    { id: 'theory', label: 'Theory', description: 'Theoretical framework and hypotheses' },
    { id: 'methodology', label: 'Methodology', description: 'Research design and sample' },
    { id: 'measures', label: 'Measures', description: 'Scales and instruments used' },
    { id: 'results', label: 'Results', description: 'Main findings and statistics' },
    { id: 'implications', label: 'Implications', description: 'Theoretical and practical contributions' },
    { id: 'limitations', label: 'Limitations', description: 'Study limitations and future research' }
  ]

  const handleFieldToggle = (fieldId: string) => {
    setSelectedFields(prev => 
      prev.includes(fieldId) 
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    )
  }

  const handleCustomFieldToggle = (fieldId: string) => {
    setSelectedCustomFields(prev => 
      prev.includes(fieldId) 
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    )
  }

  const handleSelectAll = () => {
    if (selectedFields.length === coreFields.length) {
      setSelectedFields([])
    } else {
      setSelectedFields(coreFields.map(f => f.id))
    }
  }

  const handleSelectAllCustom = () => {
    if (selectedCustomFields.length === customFields.length) {
      setSelectedCustomFields([])
    } else {
      setSelectedCustomFields(customFields.map(f => f.id))
    }
  }

  const handleReExtract = async () => {
    if (!paper) return

    const options: ReExtractionOptions = {
      fields: selectedFields,
      detailLevel,
      customFields: selectedCustomFields,
      forceReExtract
    }

    await onReExtract(paper.id!, options)
    onClose()
    
    // Reset selections
    setSelectedFields([])
    setSelectedCustomFields([])
    setForceReExtract(false)
  }

  const hasSelection = selectedFields.length > 0 || selectedCustomFields.length > 0 || forceReExtract

  if (!paper) return null

  const isFieldAlreadyExtracted = (fieldId: string) => {
    return paper.extractedData && (paper.extractedData as any)[fieldId] && 
           (paper.extractedData as any)[fieldId] !== 'Not extracted'
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Re-Extract Paper Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Paper Info */}
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-muted-foreground mt-1" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{paper.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {paper.authors} • {paper.year}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={paper.processingStatus === 'completed' ? 'default' : 'secondary'}>
                    {paper.processingStatus}
                  </Badge>
                  {paper.extractedData && (
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Extracted
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* AI Status */}
          {!aiAvailable && (
            <Card className="p-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
              <div className="flex items-center gap-2 text-orange-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">AI Not Available</span>
              </div>
              <p className="text-xs text-orange-600 mt-1">
                AI extraction is currently unavailable. Please check the cloud AI configuration for this deployment.
              </p>
            </Card>
          )}

          {/* Detail Level */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Extraction Detail Level</Label>
            <div className="flex gap-2">
              <Button
                variant={detailLevel === 'brief' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDetailLevel('brief')}
                className="flex-1"
              >
                Brief
                <span className="text-xs text-muted-foreground ml-2">
                  (1-2 sentences)
                </span>
              </Button>
              <Button
                variant={detailLevel === 'detailed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDetailLevel('detailed')}
                className="flex-1"
              >
                Detailed
                <span className="text-xs text-muted-foreground ml-2">
                  (comprehensive)
                </span>
              </Button>
            </div>
          </div>

          {/* Core Fields */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Core Fields to Re-Extract</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-xs"
              >
                {selectedFields.length === coreFields.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            
            <div className="space-y-2">
              {coreFields.map((field) => {
                const isSelected = selectedFields.includes(field.id)
                const isExtracted = isFieldAlreadyExtracted(field.id)
                
                return (
                  <div key={field.id} className="flex items-start gap-3 p-2 rounded border">
                    <Checkbox
                      id={field.id}
                      checked={isSelected}
                      onCheckedChange={() => handleFieldToggle(field.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <Label 
                        htmlFor={field.id} 
                        className="text-sm font-medium cursor-pointer flex items-center gap-2"
                      >
                        {field.label}
                        {isExtracted && (
                          <Badge variant="secondary" className="text-xs">
                            Already extracted
                          </Badge>
                        )}
                      </Label>
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Custom Fields to Extract</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllCustom}
                  className="text-xs"
                >
                  {selectedCustomFields.length === customFields.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              
              <div className="space-y-2">
                {customFields.map((field) => {
                  const isSelected = selectedCustomFields.includes(field.id)
                  
                  return (
                    <div key={field.id} className="flex items-start gap-3 p-2 rounded border">
                      <Checkbox
                        id={field.id}
                        checked={isSelected}
                        onCheckedChange={() => handleCustomFieldToggle(field.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <Label 
                          htmlFor={field.id} 
                          className="text-sm font-medium cursor-pointer"
                        >
                          {field.name}
                        </Label>
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Force Re-extract */}
          <div className="flex items-center gap-3 p-3 rounded border bg-muted/30">
            <Checkbox
              id="forceReExtract"
              checked={forceReExtract}
              onCheckedChange={(checked: boolean) => setForceReExtract(checked)}
            />
            <div className="flex-1">
              <Label htmlFor="forceReExtract" className="text-sm font-medium cursor-pointer">
                Force Complete Re-extraction
              </Label>
              <p className="text-xs text-muted-foreground">
                Re-extract all data from scratch, ignoring previous extractions
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleReExtract}
              disabled={!aiAvailable || !hasSelection || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4 mr-2" />
                  Re-Extract Data
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isProcessing}>
              Cancel
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded">
            <div className="font-medium mb-1">Tips:</div>
            <ul className="space-y-1">
              <li>• Select only the fields you want to update to save processing time</li>
              <li>• Use "Detailed" mode for comprehensive analysis</li>
              <li>• Force re-extraction will ignore all previous data</li>
              <li>• Custom fields will be processed in addition to core fields</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
