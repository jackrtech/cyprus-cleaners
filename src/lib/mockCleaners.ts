export type MockCleaner = {
  id: string
  slug: string
  display_name: string
  city: string
  hourly_rate_eur: number
  services: ('HOUSE' | 'APARTMENT')[]
  languages: string[]
  verified: boolean
  avg_rating: number
  review_count: number
  initials: string
  avatarColor: string
  avatarText: string
}

export const MOCK_CLEANERS: MockCleaner[] = [
  {
    id: '1', slug: 'maria-stavrou', display_name: 'Maria Stavrou',
    city: 'Nicosia', hourly_rate_eur: 15, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'EL'], verified: true, avg_rating: 4.9, review_count: 38,
    initials: 'M', avatarColor: '#E8F4F3', avatarText: '#19706A',
  },
  {
    id: '2', slug: 'andreas-petrou', display_name: 'Andreas Petrou',
    city: 'Limassol', hourly_rate_eur: 18, services: ['HOUSE'],
    languages: ['EN', 'EL', 'RU'], verified: true, avg_rating: 4.8, review_count: 52,
    initials: 'A', avatarColor: '#E6F1FF', avatarText: '#185FA5',
  },
  {
    id: '3', slug: 'elena-georgiou', display_name: 'Elena Georgiou',
    city: 'Larnaca', hourly_rate_eur: 14, services: ['APARTMENT'],
    languages: ['EN', 'EL'], verified: false, avg_rating: 4.7, review_count: 29,
    initials: 'E', avatarColor: '#EAF3DE', avatarText: '#3B6D11',
  },
  {
    id: '4', slug: 'natasha-ivanova', display_name: 'Natasha Ivanova',
    city: 'Paphos', hourly_rate_eur: 16, services: ['HOUSE'],
    languages: ['EN', 'RU'], verified: true, avg_rating: 4.6, review_count: 41,
    initials: 'N', avatarColor: '#FAECE7', avatarText: '#712B13',
  },
  {
    id: '5', slug: 'christos-kyriacou', display_name: 'Christos Kyriacou',
    city: 'Nicosia', hourly_rate_eur: 20, services: ['HOUSE', 'APARTMENT'],
    languages: ['EL'], verified: true, avg_rating: 5.0, review_count: 17,
    initials: 'C', avatarColor: '#EEEDFE', avatarText: '#3C3489',
  },
  {
    id: '6', slug: 'sofia-papadopoulou', display_name: 'Sofia Papadopoulou',
    city: 'Ayia Napa', hourly_rate_eur: 13, services: ['APARTMENT'],
    languages: ['EN', 'EL', 'RU'], verified: false, avg_rating: 4.5, review_count: 23,
    initials: 'S', avatarColor: '#FBEAF0', avatarText: '#72243E',
  },
]
