import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { signSupabaseAccessToken } from '@/lib/supabase/authToken'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await signSupabaseAccessToken(session.user.id)
  return NextResponse.json({ token })
}
