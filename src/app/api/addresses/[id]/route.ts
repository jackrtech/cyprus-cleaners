import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { createAdminClient } from '@/lib/supabase/server'
import { CITIES } from '@/lib/cities'

const CITY_VALUES = new Set(CITIES.map(c => c.value))

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { label, line1, city, postal_code } = body

  if (typeof line1 !== 'string' || line1.trim().length === 0) {
    return NextResponse.json({ error: 'Street address is required' }, { status: 400 })
  }
  if (line1.trim().length > 200) {
    return NextResponse.json({ error: 'Street address must be 200 characters or fewer' }, { status: 400 })
  }
  if (typeof city !== 'string' || !CITY_VALUES.has(city)) {
    return NextResponse.json({ error: 'A valid city is required' }, { status: 400 })
  }
  if (label !== undefined && label !== null && (typeof label !== 'string' || label.length > 50)) {
    return NextResponse.json({ error: 'Label must be 50 characters or fewer' }, { status: 400 })
  }
  if (postal_code !== undefined && postal_code !== null && (typeof postal_code !== 'string' || postal_code.length > 10)) {
    return NextResponse.json({ error: 'Postal code must be 10 characters or fewer' }, { status: 400 })
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

  const { data, error } = await supabase
    .from('addresses')
    .update({
      label:       label?.trim() || null,
      line1:       line1.trim(),
      city,
      postal_code: postal_code?.trim() || null,
    })
    .eq('id', params.id)
    .select('id, label, line1, city, postal_code, created_at')
    .single()

  if (error || !data) {
    console.error('PATCH address error:', error)
    return NextResponse.json({ error: 'Failed to update address' }, { status: 500 })
  }

  return NextResponse.json(data)
}

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
