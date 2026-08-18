import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  req: Request,
  { params }: { params: { cleanerProfileId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('customer_id', session.user.id)
    .eq('cleaner_profile_id', params.cleanerProfileId)

  if (error) {
    console.error('DELETE favorite error:', error)
    return NextResponse.json({ error: 'Failed to unfavorite cleaner' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
