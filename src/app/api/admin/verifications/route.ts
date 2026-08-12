import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select('id, slug, display_name, photo_url, city, cities, bio, id_submitted_at, id_photo_url, selfie_photo_url, created_at, users ( email, phone )')
    .eq('verification_status', 'PENDING')
    .order('id_submitted_at', { ascending: true })

  if (error) {
    console.error('GET admin verifications error:', error)
    return NextResponse.json({ error: 'Failed to fetch verification queue' }, { status: 500 })
  }

  // id_photo_url/selfie_photo_url are storage PATHS in the private
  // 'id-documents' bucket, not public URLs — sign them here (admin-only
  // context) so the review UI's <img src> keeps working unchanged.
  const withSignedUrls = await Promise.all((data ?? []).map(async (row: NonNullable<typeof data>[number]) => {
    const [idSigned, selfieSigned] = await Promise.all([
      row.id_photo_url
        ? supabase.storage.from('id-documents').createSignedUrl(row.id_photo_url, 300)
        : Promise.resolve({ data: null }),
      row.selfie_photo_url
        ? supabase.storage.from('id-documents').createSignedUrl(row.selfie_photo_url, 300)
        : Promise.resolve({ data: null }),
    ])
    return {
      ...row,
      id_photo_url:     idSigned.data?.signedUrl ?? null,
      selfie_photo_url: selfieSigned.data?.signedUrl ?? null,
    }
  }))

  return NextResponse.json(withSignedUrls)
}
