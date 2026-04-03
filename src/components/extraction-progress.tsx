import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  FileText,
  Brain,
  Clock,
  Trash2,
  Eye,
  RotateCcw
} from 'lucide-react'

interface ExtractionJob {
  id: string
  paperId: string
  fileName: string
  status: 'pending' | 'extracting' | 'completed' | 'error'
  progress: number
  currentStep: string
  result?: any
  error?: string
  startTime: number
  endTime?: number
}

interface ExtractionProgressProps {
  jobs: ExtractionJob[]
  onClearCompleted?: () => void
  onClearAll?: () => void
  onRetryJob?: (jobId: string) => void
  onViewResult?: (jobId: string, result: any) => void
  className?: string
}

export function ExtractionProgress({
  jobs,
  onClearCompleted,
  onClearAll,
  onRetryJob,
  onViewResult,
  className = ''
}: ExtractionProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const activeJobs = jobs.filter(job => job.status === 'extracting' || job.status === 'pending')
  const completedJobs = jobs.filter(job => job.status === 'completed')
  const errorJobs = jobs.filter(job => job.status === 'error')

  const getStatusColor = (status: ExtractionJob['status']) => {
    switch (status) {
      case 'pending': return 'text-yellow-600'
      case 'extracting': return 'text-blue-600'
      case 'completed': return 'text-green-600'
      case 'error': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: ExtractionJob['status']) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />
      case 'extracting': return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed': return <CheckCircle className="h-4 w-4" />
      case 'error': return <XCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const formatDuration = (startTime: number, endTime?: number) => {
    const duration = (endTime || Date.now()) - startTime
    const seconds = Math.floor(duration / 1000)
    
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const getJobSummary = () => {
    const total = jobs.length
    const active = activeJobs.length
    const completed = completedJobs.length
    const errors = errorJobs.length

    if (total === 0) return null

    return (
      <div className="flex items-center gap-2">
        {active > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {active} processing
          </Badge>
        )}
        {completed > 0 && (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            {completed} completed
          </Badge>
        )}
        {errors > 0 && (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {errors} failed
          </Badge>
        )}
      </div>
    )
  }

  if (jobs.length === 0) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Summary Bar */}
      <Card 
        className="p-3 cursor-pointer transition-all hover:shadow-md"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-blue-600" />
            <div>
              <div className="font-medium text-sm">AI Extraction Queue</div>
              <div className="text-xs text-muted-foreground">
                {jobs.length} paper{jobs.length !== 1 ? 's' : ''} total
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {getJobSummary()}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                ▼
              </div>
            </Button>
          </div>
        </div>
      </Card>

      {/* Detailed Job List */}
      {isExpanded && (
        <Card className="p-4 max-h-96 overflow-y-auto">
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={getStatusColor(job.status)}>
                      {getStatusIcon(job.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {job.fileName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.currentStep}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {job.status === 'error' && onRetryJob && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onRetryJob(job.id)}
                        title="Retry extraction"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    {job.status === 'completed' && job.result && onViewResult && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onViewResult(job.id, job.result)}
                        title="View results"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                {job.status === 'extracting' && (
                  <div className="mb-2">
                    <Progress value={job.progress} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      {job.progress}% complete
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {job.status === 'error' && job.error && (
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 p-2 rounded">
                    <div className="flex items-center gap-1 mb-1">
                      <AlertCircle className="h-3 w-3" />
                      <span className="font-medium">Error:</span>
                    </div>
                    <div className="line-clamp-2">{job.error}</div>
                  </div>
                )}

                {/* Timing Info */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(job.startTime, job.endTime)}</span>
                  </div>
                  <div>
                    {job.status === 'completed' && 'Completed'}
                    {job.status === 'error' && 'Failed'}
                    {job.status === 'extracting' && 'Processing...'}
                    {job.status === 'pending' && 'Queued'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4 pt-3 border-t">
            {completedJobs.length > 0 && onClearCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearCompleted}
                className="flex-1"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear Completed
              </Button>
            )}
            {onClearAll && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearAll}
                className="flex-1"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

interface QuickProgressProps {
  jobs: ExtractionJob[]
  className?: string
}

export function QuickProgress({ jobs, className = '' }: QuickProgressProps) {
  const activeJobs = jobs.filter(job => job.status === 'extracting' || job.status === 'pending')
  
  if (activeJobs.length === 0) return null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1 text-sm text-blue-600">
        <Brain className="h-4 w-4 animate-pulse" />
        <span>{activeJobs.length}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        paper{activeJobs.length !== 1 ? 's' : ''} processing
      </span>
    </div>
  )
}
