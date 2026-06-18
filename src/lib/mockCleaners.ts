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
  gender: 'female' | 'male'
  availability: ('weekdays' | 'weekends' | 'evenings')[]
  cleaner_type: 'individual' | 'company'
  total_jobs_count: number
  bio: string
}

export const MOCK_CLEANERS: MockCleaner[] = [
  {
    id: '1', slug: 'maria-stavrou', display_name: 'Maria Stavrou',
    city: 'Nicosia', hourly_rate_eur: 15, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'EL'], verified: true, avg_rating: 4.9, review_count: 38,
    initials: 'M', avatarColor: '#E8F4F3', avatarText: '#19706A',
    gender: 'female', availability: ['weekdays', 'weekends'], cleaner_type: 'individual',
    total_jobs_count: 52,
    bio: "Hi! I'm Maria, a professional cleaner based in Nicosia with over 6 years of experience. I specialise in house and apartment cleaning and take pride in leaving every home spotless. Reliable, detail-oriented, and always on time.",
  },
  {
    id: '2', slug: 'andreas-petrou', display_name: 'Andreas Petrou',
    city: 'Limassol', hourly_rate_eur: 18, services: ['HOUSE'],
    languages: ['EN', 'EL', 'RU'], verified: true, avg_rating: 4.8, review_count: 52,
    initials: 'A', avatarColor: '#E6F1FF', avatarText: '#185FA5',
    gender: 'male', availability: ['weekdays', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 78,
    bio: "Professional cleaner with 8 years experience across Limassol. Punctual, thorough, and highly rated by my clients. I bring all my own equipment and eco-friendly products.",
  },
  {
    id: '3', slug: 'elena-georgiou', display_name: 'Elena Georgiou',
    city: 'Larnaca', hourly_rate_eur: 14, services: ['APARTMENT'],
    languages: ['EN', 'EL'], verified: false, avg_rating: 4.7, review_count: 29,
    initials: 'E', avatarColor: '#EAF3DE', avatarText: '#3B6D11',
    gender: 'female', availability: ['weekdays'], cleaner_type: 'individual',
    total_jobs_count: 34,
    bio: "Based in Larnaca, I offer reliable apartment cleaning with a personal touch. I pay close attention to detail and love seeing a home transform after a good clean.",
  },
  {
    id: '4', slug: 'natasha-ivanova', display_name: 'Natasha Ivanova',
    city: 'Paphos', hourly_rate_eur: 16, services: ['HOUSE'],
    languages: ['EN', 'RU'], verified: true, avg_rating: 4.6, review_count: 41,
    initials: 'N', avatarColor: '#FAECE7', avatarText: '#712B13',
    gender: 'female', availability: ['weekdays', 'weekends', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 61,
    bio: "Experienced cleaner serving Paphos and surroundings. Russian and English speaking. Available most days including evenings and weekends.",
  },
  {
    id: '5', slug: 'christos-kyriacou', display_name: 'Christos Kyriacou',
    city: 'Nicosia', hourly_rate_eur: 20, services: ['HOUSE', 'APARTMENT'],
    languages: ['EL'], verified: true, avg_rating: 5.0, review_count: 17,
    initials: 'C', avatarColor: '#EEEDFE', avatarText: '#3C3489',
    gender: 'male', availability: ['weekends'], cleaner_type: 'company',
    total_jobs_count: 29,
    bio: "We are a small family-run cleaning company based in Nicosia. We offer professional house and apartment cleaning with consistent quality and flexible scheduling.",
  },
  {
    id: '6', slug: 'sofia-papadopoulou', display_name: 'Sofia Papadopoulou',
    city: 'Ayia Napa', hourly_rate_eur: 13, services: ['APARTMENT'],
    languages: ['EN', 'EL', 'RU'], verified: false, avg_rating: 4.5, review_count: 23,
    initials: 'S', avatarColor: '#FBEAF0', avatarText: '#72243E',
    gender: 'female', availability: ['weekdays', 'weekends'], cleaner_type: 'individual',
    total_jobs_count: 31,
    bio: "Friendly and reliable cleaner based in Ayia Napa. I speak English, Greek and Russian and am happy to accommodate special requests.",
  },
]

export type MockReview = {
  id: string
  cleaner_slug: string
  reviewer_name: string
  rating: number
  body: string
  date: string
}

export const MOCK_REVIEWS: MockReview[] = [
  // Maria Stavrou — 3 reviews
  {
    id: 'r1', cleaner_slug: 'maria-stavrou', reviewer_name: 'Eleni Papadaki',
    rating: 5, date: 'March 2025',
    body: "Maria is absolutely wonderful. My apartment has never been so clean — she's thorough, careful with my belongings, and always arrives on time. Highly recommend!",
  },
  {
    id: 'r2', cleaner_slug: 'maria-stavrou', reviewer_name: "James O'Connor",
    rating: 5, date: 'February 2025',
    body: "I've been using Maria's services for three months now and she's been consistently excellent. Very trustworthy and does a brilliant job every time.",
  },
  {
    id: 'r3', cleaner_slug: 'maria-stavrou', reviewer_name: 'Anastasia Kyriakou',
    rating: 4, date: 'January 2025',
    body: "Really happy with Maria's service. Professional, friendly, and the results speak for themselves. Scheduling can sometimes take a day to confirm but worth the wait.",
  },
  // Andreas Petrou — 2 reviews
  {
    id: 'r4', cleaner_slug: 'andreas-petrou', reviewer_name: 'Sarah Mitchell',
    rating: 5, date: 'April 2025',
    body: "Andreas cleaned our villa before we moved in and did an outstanding job. Every corner was spotless. He also brought his own supplies which was very convenient.",
  },
  {
    id: 'r5', cleaner_slug: 'andreas-petrou', reviewer_name: 'Nikos Andreou',
    rating: 5, date: 'March 2025',
    body: "Reliable, efficient and great value. Andreas has been cleaning our office monthly for six months and we couldn't be happier.",
  },
  // Elena Georgiou — 2 reviews
  {
    id: 'r6', cleaner_slug: 'elena-georgiou', reviewer_name: 'Katerina Stavrou',
    rating: 5, date: 'May 2025',
    body: "Elena did a perfect deep clean of our apartment before we listed it on Airbnb. Fast, thorough and very reasonably priced.",
  },
  {
    id: 'r7', cleaner_slug: 'elena-georgiou', reviewer_name: 'Mark Thompson',
    rating: 4, date: 'March 2025',
    body: "Good service overall. Elena is very pleasant and the apartment was well cleaned. Would book again.",
  },
  // Natasha Ivanova — 2 reviews
  {
    id: 'r8', cleaner_slug: 'natasha-ivanova', reviewer_name: 'Olga Sorokina',
    rating: 5, date: 'April 2025',
    body: "Natasha is meticulous and very professional. She cleaned our holiday villa and it looked brand new. Will definitely book again.",
  },
  {
    id: 'r9', cleaner_slug: 'natasha-ivanova', reviewer_name: 'Stavros Petrides',
    rating: 4, date: 'February 2025',
    body: "Natasha is flexible with scheduling and does a good job. She communicated clearly throughout and was easy to work with.",
  },
  // Christos Kyriacou — 2 reviews
  {
    id: 'r10', cleaner_slug: 'christos-kyriacou', reviewer_name: 'Ioanna Ioannou',
    rating: 5, date: 'May 2025',
    body: "Christos and his team are incredible. They cleaned our entire house in just a few hours and left it immaculate. A real family feel to the service.",
  },
  {
    id: 'r11', cleaner_slug: 'christos-kyriacou', reviewer_name: 'David Chen',
    rating: 5, date: 'April 2025',
    body: "Excellent company. Very professional team, reliable scheduling, and great results every time. Highly recommend for regular home cleaning.",
  },
  // Sofia Papadopoulou — 2 reviews
  {
    id: 'r12', cleaner_slug: 'sofia-papadopoulou', reviewer_name: 'Yianna Nikolaou',
    rating: 4, date: 'March 2025',
    body: "Sofia is lovely and does a thorough job. Great for holiday rentals in the area. Will rebook.",
  },
  {
    id: 'r13', cleaner_slug: 'sofia-papadopoulou', reviewer_name: 'Tom Bradley',
    rating: 5, date: 'January 2025',
    body: "Fantastic cleaner! Sofia speaks perfect English which made communication easy. Our villa was spotless when she finished. Highly recommend.",
  },
]
