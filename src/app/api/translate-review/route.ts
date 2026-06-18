import { NextRequest, NextResponse } from 'next/server'
import * as deepl from 'deepl-node'
import { createClient } from '@supabase/supabase-js'

const translator = new deepl.Translator(process.env.DEEPL_API_KEY!)

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { reviewId, text, targetLocale } = await req.json()

  if (!reviewId || !text || !targetLocale) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const targetLang = (targetLocale === 'el' ? 'EL' : 'EN-GB') as deepl.TargetLanguageCode

  // Mock data — translate without caching
  if (reviewId.startsWith('mock-')) {
    try {
      const results = await translator.translateText([text], null, targetLang)
      return NextResponse.json({ translated: results[0].text, cached: false })
    } catch (error) {
      console.error('DeepL error:', error)
      return NextResponse.json({ translated: text, cached: false })
    }
  }

  // Real Supabase review — check cache first
  try {
    const supabase = getSupabase()

    const { data: review } = await supabase
      .from('reviews')
      .select('body_translations')
      .eq('id', reviewId)
      .single()

    if (review?.body_translations?.[targetLocale]) {
      return NextResponse.json({
        translated: review.body_translations[targetLocale],
        cached: true,
      })
    }

    const results = await translator.translateText([text], null, targetLang)
    const translated = results[0].text

    const updatedTranslations = {
      ...(review?.body_translations || {}),
      [targetLocale]: translated,
    }

    await supabase
      .from('reviews')
      .update({ body_translations: updatedTranslations })
      .eq('id', reviewId)

    return NextResponse.json({ translated, cached: false })
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ translated: text, cached: false })
  }
}
