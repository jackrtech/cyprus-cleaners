const MAX_DIMENSION = 1600
const JPEG_QUALITY   = 0.8

// Downscales and re-encodes an image client-side before upload. Chat/job/profile
// photos come straight off phone cameras (often 3-5MB) and were blowing through
// Supabase's free storage tier fast; capping the longest edge and re-encoding as
// JPEG cuts a typical phone photo ~10-20x with no visible loss at chat/thumbnail
// size. Falls back to the original file if compression fails or doesn't help
// (e.g. already-small images, or transparent PNGs where JPEG re-encoding can grow).
export async function compressImage(
  file: File,
  maxDimension: number = MAX_DIMENSION,
  quality: number = JPEG_QUALITY
): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale  = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width  = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width  = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }

    // Flatten onto white first — JPEG has no alpha channel, and canvases
    // otherwise fill transparent areas black on export.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}
