// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = 'CUSTOMER' | 'CLEANER' | 'ADMIN'

export type CleanerStatus = 'ACTIVE' | 'PAUSED' | 'SUSPENDED'

export type ServiceType = 'HOUSE' | 'APARTMENT'

export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED' | 'REFUND_FAILED'
export type DisputeStatus = 'OPEN' | 'RESOLVED'
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type DisputeResolution = 'CUSTOMER' | 'CLEANER'

export type CleaningType = 'STANDARD' | 'DEEP'

export type Locale = 'en' | 'el'

// ─── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  role: UserRole
  full_name: string
  phone: string | null
  phone_verified: boolean
  avatar_url: string | null
  locale: Locale
  created_at: string
}

export interface CleanerProfile {
  id: string
  user_id: string | null
  slug: string
  display_name: string
  bio: string
  bio_el: string | null
  photo_url: string | null
  city: CyprusCity
  neighbourhoods: string[]
  hourly_rate_eur: number
  services: ServiceType[]
  languages: string[]
  has_transport: boolean
  is_company: boolean
  // Trust & verification
  verified: boolean       // Blue tick — admin-granted after ID review
  id_submitted_at: string | null
  id_photo_url: string | null
  selfie_photo_url: string | null
  verification_note: string | null
  verification_status: VerificationStatus | null
  status: CleanerStatus
  // Denormalised stats — updated by DB triggers
  avg_rating: number
  review_count: number
  unique_customer_count: number
  total_jobs_count: number
  // Availability: { mon: [9, 17], tue: [9, 17], ... }
  availability: Record<string, [number, number]> | null
  created_at: string
}

export interface Introduction {
  id: string
  customer_id: string
  cleaner_profile_id: string
  created_at: string
  // Joins
  customer?: User
  cleaner_profile?: CleanerProfile
}

export interface Booking {
  id: string
  introduction_id: string
  customer_id: string
  cleaner_profile_id: string
  service_type: ServiceType
  bedrooms: number | null
  bathrooms: number | null
  cleaning_type: CleaningType | null
  date: string        // ISO date: 2025-06-14
  start_time: string  // HH:MM
  duration_hours: number
  notes: string | null
  address: string | null
  status: BookingStatus
  review_prompted_at: string | null
  cancellation_reason: string | null
  cancelled_by: string | null
  review_skipped_at: string | null
  created_at: string
  // Joins
  customer?: User
  cleaner_profile?: CleanerProfile
  disputes?: { id: string; status: DisputeStatus }[]
}

export interface Message {
  id: string
  introduction_id: string
  sender_id: string
  body: string
  read_at: string | null
  created_at: string
  // Joins
  sender?: User
}

export interface Payment {
  id: string
  booking_id: string
  amount_eur: number
  status: PaymentStatus
  provider: string
  provider_payment_intent_id: string | null
  provider_payment_method_id: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
}

export interface Dispute {
  id: string
  booking_id: string
  customer_id: string
  cleaner_profile_id: string
  claim: string
  cleaner_response: string | null
  status: DisputeStatus
  resolution: DisputeResolution | null
  admin_note: string | null
  created_at: string
  resolved_at: string | null
}

export interface Review {
  id: string
  booking_id: string
  customer_id: string
  cleaner_profile_id: string
  rating: number  // 1–5
  body: string | null
  body_translations: Record<string, string> | null
  is_mock: boolean
  created_at: string
  // Joins
  customer?: User
}

export interface ChatNotification {
  id: string
  introduction_id: string
  recipient_id: string
  last_notified_at: string | null
  pending_count: number
}

// ─── Cyprus geography ─────────────────────────────────────────────────────────

export const CYPRUS_CITIES = [
  'Nicosia',
  'Limassol',
  'Larnaca',
  'Paphos',
  'Famagusta',
  'Paralimni',
  'Ayia Napa',
  'Protaras',
] as const

export type CyprusCity = typeof CYPRUS_CITIES[number]

export const SERVICE_TYPES: { value: ServiceType; label: string; labelEl: string }[] = [
  { value: 'HOUSE',     label: 'House cleaning',     labelEl: 'Καθαρισμός σπιτιού' },
  { value: 'APARTMENT', label: 'Apartment cleaning', labelEl: 'Καθαρισμός διαμερίσματος' },
]

export const LANGUAGES = [
  'Greek', 'English', 'Russian', 'Romanian', 'Bulgarian', 'Filipino', 'Other',
] as const

// ─── UI helpers ───────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string
  label: string
}

export interface CleanerFilters {
  city?: CyprusCity
  service?: ServiceType
  min_rate?: number
  max_rate?: number
  min_rating?: number
  verified_only?: boolean
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
}
