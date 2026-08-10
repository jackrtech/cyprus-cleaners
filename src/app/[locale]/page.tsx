import Hero from '@/components/home/Hero'
import FeaturedCleaners from '@/components/home/FeaturedCleaners'
import Footer from '@/components/Footer'

export default function HomePage() {
  return (
    <div className="pb-tabbar md:pb-0">
      <main>
        <Hero />
        <FeaturedCleaners />
      </main>
      <Footer />
    </div>
  )
}
