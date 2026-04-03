import { NextResponse } from 'next/server'
import { addCustomField, getCustomFields } from '@/lib/server/data-store'
import { type CustomField } from '@/lib/database'
import { requireRequestUser } from '@/lib/server/auth'

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ success: false, error: 'projectId is required' }, { status: 400 })
    }
    const fields = await getCustomFields(user.id, projectId)
    return NextResponse.json({ success: true, fields })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load custom fields' },
      { status }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request)
    const field = (await request.json()) as Omit<CustomField, 'id'>
    const id = await addCustomField(user.id, field)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    const status = error instanceof Error && error.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create custom field' },
      { status }
    )
  }
}
