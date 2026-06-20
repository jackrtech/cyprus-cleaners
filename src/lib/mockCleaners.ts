export type MockCleaner = {
  id: string
  slug: string
  display_name: string
  cities: string[]
  hourly_rate_eur: number
  services: ('HOUSE' | 'APARTMENT')[]
  languages: string[]
  verified: boolean
  avg_rating: number
  review_count: number
  initials: string
  avatarColor: string
  avatarText: string
  gender: 'female' | 'male' | null
  availability: ('weekdays' | 'weekends' | 'evenings')[]
  cleaner_type: 'individual' | 'company'
  total_jobs_count: number
  unique_customer_count: number
  bio: string
}

export const MOCK_CLEANERS: MockCleaner[] = [
  {
    id: '1', slug: 'maria-stavrou', display_name: 'Maria Stavrou',
    cities: ['Nicosia'], hourly_rate_eur: 15, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'EL'], verified: true, avg_rating: 4.9, review_count: 38,
    initials: 'M', avatarColor: '#E8F4F3', avatarText: '#19706A',
    gender: 'female', availability: ['weekdays', 'weekends'], cleaner_type: 'individual',
    total_jobs_count: 52, unique_customer_count: 36,
    bio: "Hi! I'm Maria, a professional cleaner based in Nicosia with over 6 years of experience. I specialise in house and apartment cleaning and take pride in leaving every home spotless. Reliable, detail-oriented, and always on time.",
  },
  {
    id: '2', slug: 'andreas-petrou', display_name: 'Andreas Petrou',
    cities: ['Limassol'], hourly_rate_eur: 18, services: ['HOUSE'],
    languages: ['EN', 'EL', 'RU'], verified: true, avg_rating: 4.8, review_count: 52,
    initials: 'A', avatarColor: '#E6F1FF', avatarText: '#185FA5',
    gender: 'male', availability: ['weekdays', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 78, unique_customer_count: 55,
    bio: "Professional cleaner with 8 years experience across Limassol. Punctual, thorough, and highly rated by my clients. I bring all my own equipment and eco-friendly products.",
  },
  {
    id: '3', slug: 'elena-georgiou', display_name: 'Elena Georgiou',
    cities: ['Larnaca'], hourly_rate_eur: 14, services: ['APARTMENT'],
    languages: ['EN', 'EL'], verified: false, avg_rating: 4.7, review_count: 29,
    initials: 'E', avatarColor: '#EAF3DE', avatarText: '#3B6D11',
    gender: 'female', availability: ['weekdays'], cleaner_type: 'individual',
    total_jobs_count: 34, unique_customer_count: 24,
    bio: "Based in Larnaca, I offer reliable apartment cleaning with a personal touch. I pay close attention to detail and love seeing a home transform after a good clean.",
  },
  {
    id: '4', slug: 'natasha-ivanova', display_name: 'Natasha Ivanova',
    cities: ['Paphos'], hourly_rate_eur: 16, services: ['HOUSE'],
    languages: ['EN', 'RU'], verified: true, avg_rating: 4.6, review_count: 41,
    initials: 'N', avatarColor: '#FAECE7', avatarText: '#712B13',
    gender: 'female', availability: ['weekdays', 'weekends', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 61, unique_customer_count: 43,
    bio: "Experienced cleaner serving Paphos and surroundings. Russian and English speaking. Available most days including evenings and weekends.",
  },
  {
    id: '5', slug: 'christos-kyriacou', display_name: 'Christos Kyriacou',
    cities: ['Nicosia'], hourly_rate_eur: 20, services: ['HOUSE', 'APARTMENT'],
    languages: ['EL'], verified: true, avg_rating: 5.0, review_count: 17,
    initials: 'C', avatarColor: '#EEEDFE', avatarText: '#3C3489',
    gender: null, availability: ['weekends'], cleaner_type: 'company',
    total_jobs_count: 29, unique_customer_count: 20,
    bio: "We are a small family-run cleaning company based in Nicosia. We offer professional house and apartment cleaning with consistent quality and flexible scheduling.",
  },
  {
    id: '6', slug: 'sofia-papadopoulou', display_name: 'Sofia Papadopoulou',
    cities: ['Ayia Napa'], hourly_rate_eur: 13, services: ['APARTMENT'],
    languages: ['EN', 'EL', 'RU'], verified: false, avg_rating: 4.5, review_count: 23,
    initials: 'S', avatarColor: '#FBEAF0', avatarText: '#72243E',
    gender: 'female', availability: ['weekdays', 'weekends'], cleaner_type: 'individual',
    total_jobs_count: 31, unique_customer_count: 22,
    bio: "Friendly and reliable cleaner based in Ayia Napa. I speak English, Greek and Russian and am happy to accommodate special requests.",
  },
  {
    id: '7', slug: 'elena-papadaki', display_name: 'Elena Papadaki',
    cities: ['Limassol'], hourly_rate_eur: 17, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'EL', 'RU'], verified: true, avg_rating: 4.9, review_count: 44,
    initials: 'E', avatarColor: '#E8F4F3', avatarText: '#19706A',
    gender: 'female', availability: ['weekdays', 'weekends'], cleaner_type: 'individual',
    total_jobs_count: 67, unique_customer_count: 48,
    bio: "Experienced cleaner based in Limassol with a passion for spotless homes. I speak English, Greek and Russian and bring my own eco-friendly products.",
  },
  {
    id: '8', slug: 'nikos-andreou', display_name: 'Nikos Andreou',
    cities: ['Nicosia'], hourly_rate_eur: 19, services: ['HOUSE'],
    languages: ['EL', 'EN'], verified: true, avg_rating: 4.7, review_count: 31,
    initials: 'N', avatarColor: '#FDF8E1', avatarText: '#BA7517',
    gender: 'male', availability: ['weekdays', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 45, unique_customer_count: 33,
    bio: "Professional and reliable cleaner serving Nicosia for 5 years. I take pride in my work and always go the extra mile for my clients.",
  },
  {
    id: '9', slug: 'anna-kowalski', display_name: 'Anna Kowalski',
    cities: ['Paphos'], hourly_rate_eur: 15, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'RU'], verified: false, avg_rating: 4.6, review_count: 19,
    initials: 'A', avatarColor: '#EAF3DE', avatarText: '#3B6D11',
    gender: 'female', availability: ['weekdays', 'weekends', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 28, unique_customer_count: 22,
    bio: "Polish-born cleaner living in Paphos for 4 years. Meticulous, fast, and friendly. Available most days including evenings and weekends.",
  },
  {
    id: '10', slug: 'sparkling-clean-cy', display_name: 'Sparkling Clean CY',
    cities: ['Limassol'], hourly_rate_eur: 22, services: ['HOUSE', 'APARTMENT'],
    languages: ['EN', 'EL', 'RU'], verified: true, avg_rating: 4.8, review_count: 86,
    initials: 'S', avatarColor: '#E6F1FF', avatarText: '#185FA5',
    gender: null, availability: ['weekdays', 'weekends'], cleaner_type: 'company',
    total_jobs_count: 143, unique_customer_count: 97,
    bio: "Professional cleaning company based in Limassol. Our team of vetted cleaners delivers consistent, high-quality results for homes and apartments across the city.",
  },
  {
    id: '11', slug: 'katerina-ioannou', display_name: 'Katerina Ioannou',
    cities: ['Larnaca'], hourly_rate_eur: 13, services: ['APARTMENT'],
    languages: ['EL', 'EN'], verified: true, avg_rating: 4.8, review_count: 27,
    initials: 'K', avatarColor: '#FBEAF0', avatarText: '#72243E',
    gender: 'female', availability: ['weekdays'], cleaner_type: 'individual',
    total_jobs_count: 39, unique_customer_count: 29,
    bio: "Local Larnaca cleaner specialising in apartment cleaning. Quiet, thorough, and trustworthy. My clients have been booking me for years.",
  },
  {
    id: '12', slug: 'dimitris-stavros', display_name: 'Dimitris Stavros',
    cities: ['Ayia Napa'], hourly_rate_eur: 16, services: ['HOUSE', 'APARTMENT'],
    languages: ['EL', 'EN', 'RU'], verified: false, avg_rating: 4.5, review_count: 14,
    initials: 'D', avatarColor: '#EEEDFE', avatarText: '#3C3489',
    gender: 'male', availability: ['weekends', 'evenings'], cleaner_type: 'individual',
    total_jobs_count: 21, unique_customer_count: 18,
    bio: "Flexible cleaner based in Ayia Napa, available weekends and evenings. Great for holiday homes and short-term rental turnovers.",
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
  // Maria Stavrou — 4 reviews (2 EN, 2 EL)
  { id: 'mock-r1', cleaner_slug: 'maria-stavrou', reviewer_name: 'Androulla K.', rating: 5, date: '2025-03-15', body: 'Maria is absolutely fantastic. My apartment has never been this clean. Punctual, thorough and very professional. Already booked her again!' },
  { id: 'mock-r2', cleaner_slug: 'maria-stavrou', reviewer_name: 'Petros M.', rating: 5, date: '2025-02-20', body: 'Πολύ χαρούμενος με την υπηρεσία. Η Μαρία έδωσε προσοχή σε κάθε γωνιά και ήταν πολύ φιλική. Θα τη συνιστούσα ανεπιφύλακτα.' },
  { id: 'mock-r3', cleaner_slug: 'maria-stavrou', reviewer_name: 'Sarah T.', rating: 4, date: '2025-01-10', body: 'Great cleaning, very reliable. Came on time and did a thorough job. Will book again.' },
  { id: 'mock-r4', cleaner_slug: 'maria-stavrou', reviewer_name: 'Κώστας Π.', rating: 5, date: '2024-12-05', body: 'Εξαιρετική δουλειά! Το σπίτι μας έλαμπε μετά την επίσκεψη της Μαρίας. Πολύ επαγγελματική και ευγενική.' },

  // Andreas Petrou — 3 reviews (2 EN, 1 EL)
  { id: 'mock-r5', cleaner_slug: 'andreas-petrou', reviewer_name: 'James R.', rating: 5, date: '2025-04-01', body: 'Andreas did an incredible job. The house was spotless and he was very professional throughout. Highly recommend.' },
  { id: 'mock-r6', cleaner_slug: 'andreas-petrou', reviewer_name: 'Μαρία Χ.', rating: 5, date: '2025-02-14', body: 'Πολύ καλή δουλειά από τον Ανδρέα. Έφτασε στην ώρα του και καθάρισε το διαμέρισμα με μεγάλη προσοχή.' },
  { id: 'mock-r7', cleaner_slug: 'andreas-petrou', reviewer_name: 'Olga S.', rating: 4, date: '2025-01-22', body: 'Very good service, Andreas is thorough and friendly. Will definitely book again.' },

  // Elena Georgiou — 2 reviews (1 EN, 1 EL)
  { id: 'mock-r8', cleaner_slug: 'elena-georgiou', reviewer_name: 'Νίκος Α.', rating: 5, date: '2025-03-08', body: 'Η Έλενα έκανε φανταστική δουλειά στο διαμέρισμά μας. Πολύ τακτική και αξιόπιστη. Θα την ξαναπαραγγείλουμε.' },
  { id: 'mock-r9', cleaner_slug: 'elena-georgiou', reviewer_name: 'Claire B.', rating: 4, date: '2025-01-30', body: 'Elena was great — efficient, friendly, and left the apartment looking spotless. Good value for money.' },

  // Natasha Ivanova — 2 reviews (2 EN)
  { id: 'mock-r10', cleaner_slug: 'natasha-ivanova', reviewer_name: 'David L.', rating: 5, date: '2025-04-10', body: 'Natasha is excellent. She is thorough, fast and very professional. Our villa has never looked better.' },
  { id: 'mock-r11', cleaner_slug: 'natasha-ivanova', reviewer_name: 'Anna M.', rating: 4, date: '2025-02-28', body: 'Very happy with the service. Natasha was on time and did a great job. Speaks good English which was helpful.' },

  // Christos Kyriacou — 2 reviews (2 EL)
  { id: 'mock-r12', cleaner_slug: 'christos-kyriacou', reviewer_name: 'Ανδρέας Σ.', rating: 5, date: '2025-03-20', body: 'Άριστη δουλειά! Ο Χρίστος είναι πολύ επαγγελματίας και φιλικός. Το σπίτι μας είναι πεντακάθαρο.' },
  { id: 'mock-r13', cleaner_slug: 'christos-kyriacou', reviewer_name: 'Ελένη Κ.', rating: 5, date: '2025-02-05', body: 'Εξαιρετικός καθαριστής. Πολύ προσεκτικός και αξιόπιστος. Τον συνιστώ ανεπιφύλακτα σε όλους.' },

  // Sofia Papadopoulou — 2 reviews (1 EN, 1 EL)
  { id: 'mock-r14', cleaner_slug: 'sofia-papadopoulou', reviewer_name: 'Ivan K.', rating: 4, date: '2025-03-25', body: 'Sofia did a good job cleaning our holiday apartment. Friendly and hardworking. Would use again.' },
  { id: 'mock-r15', cleaner_slug: 'sofia-papadopoulou', reviewer_name: 'Σταύρος Μ.', rating: 5, date: '2025-01-15', body: 'Η Σοφία είναι εξαιρετική! Πολύ φιλική και κάνει άριστη δουλειά. Το διαμέρισμά μας ήταν σαν καινούριο.' },

  // Elena Papadaki — 3 reviews (2 EL, 1 EN)
  { id: 'mock-r16', cleaner_slug: 'elena-papadaki', reviewer_name: 'Χριστίνα Λ.', rating: 5, date: '2025-04-05', body: 'Η Έλενα είναι απλά η καλύτερη! Πολύ επαγγελματική, γρήγορη και προσεκτική. Το σπίτι μου λάμπει μετά από κάθε επίσκεψή της.' },
  { id: 'mock-r17', cleaner_slug: 'elena-papadaki', reviewer_name: 'Γιώργος Π.', rating: 5, date: '2025-03-01', body: 'Εξαιρετική υπηρεσία. Η Έλενα έφτασε στην ώρα της και έκανε φανταστική δουλειά. Συνιστάται ανεπιφύλακτα.' },
  { id: 'mock-r18', cleaner_slug: 'elena-papadaki', reviewer_name: 'Natalie W.', rating: 4, date: '2025-02-10', body: 'Elena was brilliant — very thorough and left my apartment immaculate. Great value and very easy to communicate with.' },

  // Nikos Andreou — 2 reviews (1 EN, 1 EL)
  { id: 'mock-r19', cleaner_slug: 'nikos-andreou', reviewer_name: 'Michael T.', rating: 5, date: '2025-04-12', body: 'Nikos did an excellent job. Very professional and efficient. My house was spotless when he finished.' },
  { id: 'mock-r20', cleaner_slug: 'nikos-andreou', reviewer_name: 'Δήμητρα Κ.', rating: 4, date: '2025-02-18', body: 'Καλή δουλειά από τον Νίκο. Ήταν στην ώρα του και έκανε καλό καθάρισμα. Θα τον ξαναπαρακαλέσω.' },

  // Anna Kowalski — 2 reviews (2 EN)
  { id: 'mock-r21', cleaner_slug: 'anna-kowalski', reviewer_name: 'Robert B.', rating: 5, date: '2025-03-30', body: 'Anna is fantastic — incredibly thorough and always on time. She even cleaned areas I forgot to mention. Highly recommended.' },
  { id: 'mock-r22', cleaner_slug: 'anna-kowalski', reviewer_name: 'Svetlana M.', rating: 4, date: '2025-01-25', body: 'Very good service from Anna. She works quickly and efficiently and is very friendly. Will book again for sure.' },

  // Sparkling Clean CY — 3 reviews (1 EN, 2 EL)
  { id: 'mock-r23', cleaner_slug: 'sparkling-clean-cy', reviewer_name: 'Φώτης Α.', rating: 5, date: '2025-04-08', body: 'Εξαιρετική εταιρεία! Η ομάδα ήταν πολύ επαγγελματική και το αποτέλεσμα ήταν άψογο. Σίγουρα θα τους ξαναχρησιμοποιήσω.' },
  { id: 'mock-r24', cleaner_slug: 'sparkling-clean-cy', reviewer_name: 'Emma S.', rating: 5, date: '2025-03-15', body: 'Outstanding service from the Sparkling Clean team. Two cleaners arrived on time and worked efficiently. The house was immaculate.' },
  { id: 'mock-r25', cleaner_slug: 'sparkling-clean-cy', reviewer_name: 'Μαρίνα Θ.', rating: 4, date: '2025-02-22', body: 'Πολύ καλή υπηρεσία. Η ομάδα ήταν ευγενική και αποτελεσματική. Θα τους συνιστούσα σε φίλους και γνωστούς.' },

  // Katerina Ioannou — 2 reviews (2 EL)
  { id: 'mock-r26', cleaner_slug: 'katerina-ioannou', reviewer_name: 'Παναγιώτης Χ.', rating: 5, date: '2025-04-02', body: 'Η Κατερίνα κάνει εξαιρετική δουλειά! Πολύ προσεκτική και αξιόπιστη. Το διαμέρισμά μου είναι πάντα τέλειο μετά την επίσκεψή της.' },
  { id: 'mock-r27', cleaner_slug: 'katerina-ioannou', reviewer_name: 'Σοφία Ν.', rating: 4, date: '2025-02-12', body: 'Καλή και αξιόπιστη καθαρίστρια. Έρχεται πάντα στην ώρα της και κάνει καλή δουλειά. Την συνιστώ.' },

  // Dimitris Stavros — 2 reviews (1 EN, 1 EL)
  { id: 'mock-r28', cleaner_slug: 'dimitris-stavros', reviewer_name: 'Tom H.', rating: 4, date: '2025-03-28', body: 'Dimitris cleaned our holiday villa before our arrival. Everything was spotless and he was easy to communicate with remotely.' },
  { id: 'mock-r29', cleaner_slug: 'dimitris-stavros', reviewer_name: 'Αντώνης Μ.', rating: 5, date: '2025-01-20', body: 'Πολύ καλός καθαριστής. Ευέλικτος με τα ωράρια και κάνει άριστη δουλειά. Ιδανικός για εξοχικές κατοικίες.' },
]
