import { NextResponse } from 'next/server'
import { deleteProject, getProject, updateProject } from '@/lib/server/data-store'
import { requireRequestUser } from '@/lib/server/auth'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(_)
    const { id } = await context.params
    const project = await getProject(user.id, id)
    return NextResponse.json({ success: true, project: project || null })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load project' },
      { status }
    )
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request)
    const { id } = await context.params
    const updates = await request.json()
    await updateProject(user.id, id, updates)
    return NextResponse.json({ success: true })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update project' },
      { status }
    )
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(_)
    const { id } = await context.params
    await deleteProject(user.id, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete project' },
      { status }
    )
  }
}
