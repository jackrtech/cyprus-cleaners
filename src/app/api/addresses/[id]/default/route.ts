import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

// At most one default address per user — enforced here rather than a DB
// constraint (an "at most one true" rule needs a partial unique index;
// simpler to just own it in the one place that ever sets it) by clearing
// every other address first, then setting this one.
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('addresses')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!existing || existing.user_id !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await supabase.from('addresses').update({ is_default: false }).eq('user_id', session.user.id)

  const { data, error } = await supabase
    .from('addresses')
    .update({ is_default: true })
    .eq('id', params.id)
    .select('id, label, line1, city, area, postal_code, lat, lng, finding_us_notes, is_default, created_at')
    .single()

  if (error || !data) {
    console.error('POST address default error:', error)
    return NextResponse.json({ error: 'Failed to set default address' }, { status: 500 })
  }

  return NextResponse.json(data)
}
