import CleanersDirectoryView from '@/components/cleaners/CleanersDirectoryView'

// App-native counterpart to the public /cleaners marketing page — same
// component, wrapped in the (app) shell (Navbar hidden on mobile, BottomTabBar
// visible) instead of the marketing chrome. This is what the BottomTabBar's
// Search tab links to for a logged-in user (see BUILD: BottomTabBar becomes
// session-driven, 2026-08-19).
export default function AppSearchPage() {
  return <CleanersDirectoryView />
}
