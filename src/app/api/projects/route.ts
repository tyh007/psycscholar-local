import { NextResponse } from 'next/server'
import { createProject, getProjects } from '@/lib/server/data-store'
import { requireRequestUser } from '@/lib/server/auth'
import { getErrorMessage } from '@/lib/server/error-utils'

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const projects = await getProjects(user.id)
    return NextResponse.json({ success: true, projects })
  } catch (error) {
    console.error('GET /api/projects failed:', error)
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to load projects') },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const body = (await request.json()) as { name?: string; description?: string }
    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'Project name is required' }, { status: 400 })
    }
    const project = await createProject(user.id, body.name.trim(), body.description)
    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('POST /api/projects failed:', error)
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: getErrorMessage(error, 'Failed to create project') },
      { status }
    )
  }
}
