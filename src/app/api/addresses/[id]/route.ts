import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: address } = await supabase
    .from('addresses')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!address || address.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase.from('addresses').delete().eq('id', params.id)

  if (error) {
    console.error('DELETE address error:', error)
    return NextResponse.json({ error: 'Failed to delete address' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
