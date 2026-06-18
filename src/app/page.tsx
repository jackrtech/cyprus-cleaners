export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-h1 text-teal-900 mb-4">Cyprus Cleaners</h1>
        <p className="text-body text-muted mb-8">
          Sprint 1 scaffold complete. Ready to build.
        </p>
        <div className="flex gap-3 justify-center">
          <a href="/auth/register" className="btn-primary">Get started</a>
          <a href="/cleaners"      className="btn-secondary">Find cleaners</a>
        </div>
      </div>
    </main>
  )
}
