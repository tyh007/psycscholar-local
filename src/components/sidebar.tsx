"use client"

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { 
  FolderPlus, 
  Search, 
  Settings, 
  FileText,
  ChevronRight,
  Plus,
  Trash2,
  ArchiveRestore
} from 'lucide-react'
import { type Project } from '@/lib/database'

interface SidebarProps {
  projects: Project[]
  activeProject: string | null
  onProjectSelect: (projectId: string) => void
  onProjectCreate: (name: string) => void
  onProjectDelete: (projectId: string) => void
  onOpenSettings?: () => void
  viewMode?: 'library' | 'trash'
  trashCount?: number
  onOpenTrash?: () => void
  onBackToLibrary?: () => void
}

export function Sidebar({ 
  projects, 
  activeProject, 
  onProjectSelect, 
  onProjectCreate,
  onProjectDelete,
  onOpenSettings,
  viewMode = 'library',
  trashCount = 0,
  onOpenTrash,
  onBackToLibrary
}: SidebarProps) {
  const [newProjectName, setNewProjectName] = useState('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreateProject = () => {
    if (newProjectName.trim()) {
      onProjectCreate(newProjectName.trim())
      setNewProjectName('')
      setIsCreatingProject(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">PsycScholar</h1>
          <Button variant="ghost" size="sm" type="button" onClick={() => onOpenSettings?.()} title="Settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        {viewMode === 'trash' ? (
          <Button variant="secondary" size="sm" className="w-full justify-start gap-2" type="button" onClick={() => onBackToLibrary?.()}>
            <ArchiveRestore className="h-4 w-4" />
            Back to papers
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full justify-between gap-2" type="button" onClick={() => onOpenTrash?.()}>
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Recycle bin
            </span>
            {trashCount > 0 ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{trashCount}</span>
            ) : null}
          </Button>
        )}
      </div>

      {/* Projects List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreatingProject(true)}
            className="h-8"
            type="button"
          >
            <Plus className="mr-1 h-3 w-3" />
            New
          </Button>
        </div>

        {/* New Project Input */}
        {isCreatingProject && (
          <Card className="mb-4 border-primary/20 p-3">
            <div className="flex gap-2">
              <Input
                placeholder="Project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                className="flex-1"
                autoFocus
              />
              <Button size="sm" type="button" onClick={handleCreateProject}>
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                type="button"
                onClick={() => {
                  setIsCreatingProject(false)
                  setNewProjectName('')
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Project Items */}
        <div className="space-y-2">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className={cn(
                "group p-4 cursor-pointer transition-all hover:shadow-md border-l-4",
                activeProject === project.id 
                  ? "border-l-primary bg-primary/5" 
                  : "border-l-transparent hover:border-l-primary/30"
              )}
              onClick={() => project.id && onProjectSelect(project.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{project.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {project.paperCount} papers • {project.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      project.id && onProjectDelete(project.id)
                    }}
                    className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {filteredProjects.length === 0 && !isCreatingProject && (
            <div className="py-8 text-center">
              <FolderPlus className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="mb-4 text-sm text-muted-foreground">
                {searchQuery ? 'No projects found' : 'No projects yet'}
              </p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsCreatingProject(true)}
              >
                Create your first project
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
