import { NextResponse } from 'next/server'
import {
  deletePaper,
  getPaper,
  movePaperToTrash,
  restorePaperFromTrash,
  updatePaper
} from '@/lib/server/data-store'
import { requireRequestUser } from '@/lib/server/auth'

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(_)
    const { id } = await context.params
    const paper = await getPaper(user.id, id)
    return NextResponse.json({ success: true, paper: paper || null })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load paper' },
      { status }
    )
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request)
    const { id } = await context.params
    const body = await request.json()

    if (body.action === 'moveToTrash') {
      await movePaperToTrash(user.id, id)
    } else if (body.action === 'restoreFromTrash') {
      await restorePaperFromTrash(user.id, id)
    } else {
      await updatePaper(user.id, id, body)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update paper' },
      { status }
    )
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(_)
    const { id } = await context.params
    await deletePaper(user.id, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete paper' },
      { status }
    )
  }
}
