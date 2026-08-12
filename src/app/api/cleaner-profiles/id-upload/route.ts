import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const BUCKET = 'id-documents'

// Step 1 of ID submission — mints two short-lived signed *upload* URLs so the
// ID photo and selfie go straight from the cleaner's browser to the private
// 'id-documents' bucket, never through this server (nothing to log, cache,
// or accidentally retain along the way). Paths are stable per cleaner
// profile (upsert: true) so resubmitting after a rejection overwrites
// cleanly rather than accumulating old documents.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('cleaner_profiles')
    .select('id')
    .eq('user_id', session.user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const idPath     = `${profile.id}/id-document`
  const selfiePath = `${profile.id}/selfie`

  const [idResult, selfieResult] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUploadUrl(idPath, { upsert: true }),
    supabase.storage.from(BUCKET).createSignedUploadUrl(selfiePath, { upsert: true }),
  ])

  if (idResult.error || selfieResult.error) {
    console.error('ID upload — signed URL error:', idResult.error, selfieResult.error)
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 })
  }

  return NextResponse.json({
    idUpload: {
      signedUrl: idResult.data.signedUrl,
      token:     idResult.data.token,
      path:      idResult.data.path,
    },
    selfieUpload: {
      signedUrl: selfieResult.data.signedUrl,
      token:     selfieResult.data.token,
      path:      selfieResult.data.path,
    },
  })
}
