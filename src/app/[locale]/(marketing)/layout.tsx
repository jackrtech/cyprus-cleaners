import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar hideOnMobileWhenLoggedIn />
      <main id="main-content">{children}</main>
      <Footer hideOnMobileWhenLoggedIn />
    </>
  )
}
