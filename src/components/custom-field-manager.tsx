import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Lightbulb,
  BookOpen,
  Target,
  Zap,
  Settings
} from 'lucide-react'
import { PSYCHOLOGY_CUSTOM_FIELDS, type CustomFieldDefinition } from '@/lib/prompt-builder'

interface CustomFieldManagerProps {
  isOpen: boolean
  onClose: () => void
  customFields: CustomFieldDefinition[]
  onAddField: (field: CustomFieldDefinition) => void
  onUpdateField: (fieldId: string, updates: Partial<CustomFieldDefinition>) => void
  onDeleteField: (fieldId: string) => void
  onAddPsychologyFields: () => void
}

export function CustomFieldManager({
  isOpen,
  onClose,
  customFields,
  onAddField,
  onUpdateField,
  onDeleteField,
  onAddPsychologyFields
}: CustomFieldManagerProps) {
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: ''
  })

  const resetForm = () => {
    setFormData({ name: '', description: '', prompt: '' })
    setEditingField(null)
  }

  const handleEdit = (field: CustomFieldDefinition) => {
    setEditingField(field)
    setFormData({
      name: field.name,
      description: field.description,
      prompt: field.prompt
    })
  }

  const handleSave = () => {
    if (!formData.name.trim() || !formData.description.trim() || !formData.prompt.trim()) {
      return
    }

    const fieldData: CustomFieldDefinition = {
      id: editingField?.id || `field-${Date.now()}`,
      name: formData.name.trim(),
      description: formData.description.trim(),
      prompt: formData.prompt.trim()
    }

    if (editingField) {
      onUpdateField(editingField.id, fieldData)
    } else {
      onAddField(fieldData)
    }

    resetForm()
  }

  const handleDelete = (fieldId: string) => {
    if (confirm('Are you sure you want to delete this custom field?')) {
      onDeleteField(fieldId)
    }
  }

  const getFieldIcon = (fieldName: string) => {
    const name = fieldName.toLowerCase()
    if (name.includes('sample') || name.includes('demographic')) return <Target className="h-4 w-4" />
    if (name.includes('effect') || name.includes('statistic')) return <Zap className="h-4 w-4" />
    if (name.includes('theory') || name.includes('conceptual')) return <BookOpen className="h-4 w-4" />
    if (name.includes('practical') || name.includes('application')) return <Lightbulb className="h-4 w-4" />
    return <Settings className="h-4 w-4" />
  }

  const predefinedTemplates = [
    {
      name: 'Mediation Analysis',
      description: 'Extract mediation variables and indirect effects',
      prompt: 'Identify and extract all mediation variables, mediators, and indirect effects mentioned in the study. Include statistical values for mediation analysis if available.'
    },
    {
      name: 'Moderator Analysis',
      description: 'Extract moderator variables and interaction effects',
      prompt: 'Identify and extract all moderator variables, interaction effects, and conditional relationships. Include statistical values for moderation analysis if available.'
    },
    {
      name: 'Statistical Power',
      description: 'Extract power analysis and sample size justification',
      prompt: 'Extract information about statistical power, effect size calculations, sample size justification, and power analysis results.'
    },
    {
      name: 'Clinical Significance',
      description: 'Extract clinical significance and practical importance',
      prompt: 'Extract information about clinical significance, practical importance, minimal clinically important difference, and real-world impact of findings.'
    }
  ]

  const useTemplate = (template: typeof predefinedTemplates[0]) => {
    setFormData({
      name: template.name,
      description: template.description,
      prompt: template.prompt
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Custom Field Manager</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onAddPsychologyFields}
                className="gap-1"
              >
                <BookOpen className="h-4 w-4" />
                Add Psychology Fields
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingField({ ...formData, id: '', name: '', description: '', prompt: '' })}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                New Field
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* Field List */}
          <div className="w-1/2 border-r pr-4">
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-2">Active Custom Fields</h3>
              <div className="text-xs text-muted-foreground">
                {customFields.length} field{customFields.length !== 1 ? 's' : ''} configured
              </div>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {customFields.map((field) => (
                  <Card key={field.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className="mt-1">
                          {getFieldIcon(field.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{field.name}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {field.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleEdit(field)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleDelete(field.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}

                {customFields.length === 0 && (
                  <div className="text-center py-8">
                    <Settings className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No custom fields configured yet
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingField({ ...formData, id: '', name: '', description: '', prompt: '' })}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Field
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Editor */}
          <div className="w-1/2 pl-4">
            {(editingField || formData.name) ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-sm mb-4">
                    {editingField ? 'Edit Custom Field' : 'Create Custom Field'}
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fieldName">Field Name</Label>
                    <Input
                      id="fieldName"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Sample Demographics"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fieldDescription">Description</Label>
                    <Textarea
                      id="fieldDescription"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="What information should this field extract?"
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="fieldPrompt">Extraction Prompt</Label>
                    <Textarea
                      id="fieldPrompt"
                      value={formData.prompt}
                      onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                      placeholder="Detailed instructions for AI extraction..."
                      rows={4}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Be specific about what information to extract and how to format it.
                    </div>
                  </div>

                  {/* Templates */}
                  {!editingField && (
                    <div>
                      <Label>Quick Templates</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {predefinedTemplates.map((template, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => useTemplate(template)}
                            className="text-xs h-auto py-2 px-2 text-left"
                          >
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {template.description}
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSave} className="flex-1">
                      <Save className="h-4 w-4 mr-2" />
                      {editingField ? 'Update Field' : 'Create Field'}
                    </Button>
                    <Button variant="outline" onClick={resetForm}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Plus className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">Create or Edit Custom Fields</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select a field to edit or create a new one to extract specific information from your papers.
                  </p>
                  <div className="space-y-2 text-left max-w-sm mx-auto">
                    <div className="text-xs text-muted-foreground">
                      <strong>Examples:</strong>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• Sample demographics (age, gender, education)</div>
                      <div>• Effect sizes and statistical significance</div>
                      <div>• Clinical significance and practical impact</div>
                      <div>• Mediation and moderation variables</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
