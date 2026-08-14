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

  // Batched rather than one unbounded query — PostgREST caps a single
  // response at 1000 rows by default, so a large backlog (first run, or a
  // day the job didn't fire) would otherwise silently leave the rest
  // uncleaned instead of catching up over the next few runs.
  const BATCH_SIZE = 500
  let totalDeleted = 0

  while (true) {
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('id, photo_path, body')
      .not('photo_path', 'is', null)
      .lt('created_at', cutoff)
      .limit(BATCH_SIZE)

    if (fetchError) {
      console.error('Chat photo cleanup fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to query expired photos', deleted: totalDeleted }, { status: 500 })
    }

    const expired = (data ?? []) as ExpiredMessage[]
    if (expired.length === 0) break

    const paths = expired.map(m => m.photo_path as string)
    const { error: removeError } = await supabase.storage.from('chat-photos').remove(paths)
    if (removeError) {
      console.error('Chat photo cleanup storage error:', removeError)
      return NextResponse.json({ error: 'Failed to delete storage objects', deleted: totalDeleted }, { status: 500 })
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

    totalDeleted += expired.length
    if (expired.length < BATCH_SIZE) break
  }

  return NextResponse.json({ deleted: totalDeleted })
}
