import type { Metadata } from 'next'
import Footer from '@/components/Footer'
import ContactForm from '@/components/contact/ContactForm'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  return pageMetadata({ locale: params.locale, path: '/contact', titleKey: 'contactTitle', descriptionKey: 'contactDescription' })
}

export default function ContactPage() {
  return (
    <>
    <div className="min-h-screen bg-[#F7FAF9] dark:bg-[#0F1817] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="card p-8">
          <ContactForm />
        </div>
      </div>
    </div>
    <Footer />
    </>
  )
}
