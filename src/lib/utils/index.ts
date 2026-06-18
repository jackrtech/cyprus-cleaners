import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes safely — use this everywhere instead of string concatenation
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a Cyprus city for display
export function formatCity(city: string): string {
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase()
}

// Format hourly rate
export function formatRate(rate: number): string {
  return `€${rate}/hr`
}

// Format rating to 1 decimal place
export function formatRating(rating: number): string {
  return rating.toFixed(1)
}

// Generate a slug from a name
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Format date for display
export function formatDate(dateStr: string, locale: string = 'en'): string {
  return new Date(dateStr).toLocaleDateString(locale === 'el' ? 'el-GR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Format time for display
export function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

// Stars array helper
export function getStars(rating: number): ('full' | 'empty')[] {
  return Array.from({ length: 5 }, (_, i) => (i < Math.round(rating) ? 'full' : 'empty'))
}

// Truncate bio for card display
export function truncate(str: string, maxLength: number = 120): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength).trim() + '…'
}
