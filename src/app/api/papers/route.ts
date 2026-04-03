import { NextResponse } from 'next/server'
import { addPaper, getPapers } from '@/lib/server/data-store'
import { type Paper } from '@/lib/database'
import { requireRequestUser } from '@/lib/server/auth'

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const view = searchParams.get('view') || 'library'
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 })
    }
    const papers = await getPapers(user.id, projectId, view === 'trash')
    return NextResponse.json({ success: true, papers })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load papers' },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const paper = (await request.json()) as Omit<Paper, 'id'>
    const id = await addPaper(user.id, paper)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create paper' },
      { status }
    )
  }
}
