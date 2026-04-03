import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  Brain, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Settings,
  Wifi,
  WifiOff,
  Cpu
} from 'lucide-react'

interface AIStatusIndicatorProps {
  isAvailable: boolean
  isChecking: boolean
  availableModels?: string[]
  currentModel: string
  baseUrl?: string
  error?: string
  onModelChange?: (model: string) => void
  onRetryConnection?: () => void
  onOpenSettings?: () => void
  className?: string
}

export function AIStatusIndicator({
  isAvailable,
  isChecking,
  availableModels,
  currentModel,
  baseUrl,
  error,
  onModelChange,
  onRetryConnection,
  onOpenSettings,
  className = ''
}: AIStatusIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusColor = () => {
    if (isChecking) return 'text-yellow-600'
    if (isAvailable) return 'text-green-600'
    return 'text-red-600'
  }

  const getStatusIcon = () => {
    if (isChecking) return <Loader2 className="h-4 w-4 animate-spin" />
    if (isAvailable) return <CheckCircle className="h-4 w-4" />
    return <XCircle className="h-4 w-4" />
  }

  const getStatusText = () => {
    if (isChecking) return 'Checking Ollama...'
    if (isAvailable) return 'Ollama Ready'
    return 'Ollama Unavailable'
  }

  const getConnectionIcon = () => {
    if (isAvailable) return <Wifi className="h-3 w-3" />
    return <WifiOff className="h-3 w-3" />
  }

  return (
    <div className={`relative ${className}`}>
      {/* Compact Status */}
      <Card 
        className="p-3 cursor-pointer transition-all hover:shadow-md"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={getStatusColor()}>
              {getStatusIcon()}
            </div>
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
            <div className={getStatusColor()}>
              {getConnectionIcon()}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isAvailable && (
              <Badge variant="secondary" className="text-xs">
                Local Ollama
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation()
                onOpenSettings?.()
              }}
            >
              <Settings className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && !isAvailable && (
          <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span className="line-clamp-2">{error}</span>
          </div>
        )}
      </Card>

      {/* Expanded Details */}
      {isExpanded && (
        <Card className="mt-2 p-4 border-t-2">
          <div className="space-y-4">
            {/* Model Selection */}
            {isAvailable && availableModels && availableModels.length > 0 && (
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  AI Model
                </label>
                <Select value={currentModel} onValueChange={onModelChange}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        <div className="flex items-center gap-2">
                          <Brain className="h-3 w-3" />
                          {model}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Connection Details */}
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Connection Details
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={getStatusColor()}>
                    {isAvailable ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server:</span>
                  <span>{baseUrl || 'http://localhost:11434'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Models Available:</span>
                  <span>{availableModels?.length ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {!isAvailable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetryConnection}
                  className="flex-1"
                >
                  <Loader2 className="h-3 w-3 mr-1" />
                  Retry Connection
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="flex-1"
              >
                <Settings className="h-3 w-3 mr-1" />
                AI Settings
              </Button>
            </div>

            {/* Help Text */}
            {error && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <div className="font-medium mb-1">Troubleshooting</div>
                <ul className="space-y-1">
                  <li>• Install and launch Ollama on this computer</li>
                  <li>• Pull a model such as <code className="bg-background px-1 rounded">ollama pull qwen2.5:3b</code></li>
                  <li>• For the hosted app, start Ollama with <code className="bg-background px-1 rounded">OLLAMA_ORIGINS=https://psycscholar-local.vercel.app ollama serve</code></li>
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

interface AIStatusBadgeProps {
  isAvailable: boolean
  isChecking: boolean
  className?: string
}

export function AIStatusBadge({ isAvailable, isChecking, className = '' }: AIStatusBadgeProps) {
  if (isChecking) {
    return (
      <Badge variant="secondary" className={`gap-1 ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking Ollama
      </Badge>
    )
  }

  if (isAvailable) {
    return (
      <Badge variant="default" className={`gap-1 bg-green-600 hover:bg-green-700 ${className}`}>
        <CheckCircle className="h-3 w-3" />
        Ollama Ready
      </Badge>
    )
  }

  return (
      <Badge variant="destructive" className={`gap-1 ${className}`}>
        <XCircle className="h-3 w-3" />
      Ollama Offline
      </Badge>
  )
}

interface ProcessingIndicatorProps {
  activeJobs: number
  totalJobs?: number
  className?: string
}

export function ProcessingIndicator({ 
  activeJobs, 
  totalJobs, 
  className = '' 
}: ProcessingIndicatorProps) {
  if (activeJobs === 0) return null

  return (
    <Card className={`p-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-blue-600 animate-pulse" />
        <div className="text-sm">
          <span className="font-medium text-blue-600">{activeJobs}</span>
          <span className="text-muted-foreground">
            {totalJobs ? ` / ${totalJobs}` : ''} paper{activeJobs !== 1 ? 's' : ''} processing
          </span>
        </div>
      </div>
    </Card>
  )
}
