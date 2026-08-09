import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const RETENTION_DAYS = 90

// Runs daily via Vercel Cron (see vercel.json) to keep chat-photos storage
// usage bounded — chat photos are disposable in a way booking/job photos
// aren't, so old ones are pruned rather than kept forever.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  interface ExpiredMessage { id: string; photo_path: string | null; body: string | null }

  const { data, error: fetchError } = await supabase
    .from('messages')
    .select('id, photo_path, body')
    .not('photo_path', 'is', null)
    .lt('created_at', cutoff)

  if (fetchError) {
    console.error('Chat photo cleanup fetch error:', fetchError)
    return NextResponse.json({ error: 'Failed to query expired photos' }, { status: 500 })
  }

  const expired = (data ?? []) as ExpiredMessage[]
  if (expired.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  const paths = expired.map(m => m.photo_path as string)
  const { error: removeError } = await supabase.storage.from('chat-photos').remove(paths)
  if (removeError) {
    console.error('Chat photo cleanup storage error:', removeError)
    return NextResponse.json({ error: 'Failed to delete storage objects' }, { status: 500 })
  }

  // messages_body_or_photo requires a body once photo_path is cleared, so
  // photo-only messages get a placeholder instead of just nulling the path.
  const withBody = expired.filter(m => m.body).map(m => m.id)
  const bodyless = expired.filter(m => !m.body).map(m => m.id)

  if (withBody.length > 0) {
    await supabase.from('messages').update({ photo_path: null }).in('id', withBody)
  }
  if (bodyless.length > 0) {
    await supabase
      .from('messages')
      .update({ photo_path: null, body: '📷 Photo (removed after 90 days)' })
      .in('id', bodyless)
  }

  return NextResponse.json({ deleted: expired.length })
}
