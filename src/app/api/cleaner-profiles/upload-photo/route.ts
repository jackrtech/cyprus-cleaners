import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'CLEANER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('photo')

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No photo provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const path = `${session.user.id}/avatar.jpg`

  const arrayBuffer = await file.arrayBuffer()
  const { error } = await supabase.storage
    .from('cleaner-photos')
    .upload(path, arrayBuffer, { upsert: true, contentType: file.type })

  if (error) {
    console.error('Photo upload error:', error)
    return NextResponse.json({ error: 'Upload failed', detail: error.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('cleaner-photos').getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl })
}
