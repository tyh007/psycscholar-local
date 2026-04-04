'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { AIProvider } from '@/lib/ai-provider-config'
import { getAIProviderConfig, saveAIProviderConfig, isGeminiConfigured } from '@/lib/ai-provider-config'

interface AISettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettingsSaved?: () => void
}

export function AISettingsDialog({ open, onOpenChange, onSettingsSaved }: AISettingsDialogProps) {
  const [provider, setProvider] = useState<AIProvider>('ollama')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Load current settings when dialog opens
  useEffect(() => {
    if (open) {
      const config = getAIProviderConfig()
      setProvider(config.provider)
      setGeminiApiKey(config.geminiApiKey || '')
      setSaveSuccess(false)
    }
  }, [open])

  const handleSave = () => {
    setIsSaving(true)
    
    try {
      saveAIProviderConfig({
        provider,
        geminiApiKey: provider === 'gemini' ? geminiApiKey : undefined
      })
      
      setSaveSuccess(true)
      setTimeout(() => {
        setSaveSuccess(false)
        onOpenChange(false)
        onSettingsSaved?.()
      }, 1500)
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const isGeminiValid = provider === 'ollama' || (provider === 'gemini' && geminiApiKey.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Provider Settings</DialogTitle>
          <DialogDescription>
            Choose your preferred AI extraction method. Default is local Ollama for fast, private extraction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">AI Provider</Label>
            <RadioGroup value={provider} onValueChange={(val) => setProvider(val as AIProvider)}>
              {/* Ollama Option */}
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors">
                <RadioGroupItem value="ollama" id="ollama" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="ollama" className="font-semibold cursor-pointer">
                    Local Ollama (Recommended)
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    Fast, private, no API key needed. Uses your local machine.
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Make sure Ollama is running on http://127.0.0.1:11434
                  </p>
                </div>
              </div>

              {/* Gemini Option */}
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors">
                <RadioGroupItem value="gemini" id="gemini" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="gemini" className="font-semibold cursor-pointer">
                    Google Gemini (Cloud)
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    More advanced AI but requires your own API key. Processes your paper text on Google servers.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Gemini API Key Input */}
          {provider === 'gemini' && (
            <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Label htmlFor="apiKey" className="text-sm font-semibold">
                Google Gemini API Key
              </Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sk-... or your Gemini API key"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-600">
                Get your free API key from{' '}
                <a
                  href="https://ai.google.dev/tutorials/setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google AI Studio
                </a>
              </p>
              {geminiApiKey && (
                <div className="flex items-center gap-2 text-xs text-green-600 mt-2">
                  <CheckCircle2 className="h-3 w-3" />
                  API Key configured
                </div>
              )}
            </div>
          )}

          {/* Ollama Info */}
          {provider === 'ollama' && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800">
                ✓ Using local Ollama for fast, private extraction. No API key required.
              </p>
            </div>
          )}

          {/* Validation Alert */}
          {!isGeminiValid && provider === 'gemini' && (
            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">
                Please enter a valid Gemini API key
              </p>
            </div>
          )}

          {/* Save Success */}
          {saveSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-700">
                Settings saved successfully!
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-6 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !isGeminiValid}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
