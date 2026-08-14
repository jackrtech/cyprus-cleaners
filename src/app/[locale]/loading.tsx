import Spinner from '@/components/ui/Spinner'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F7FAF9] flex items-center justify-center">
      <Spinner size={28} className="text-[#19706A]" />
    </div>
  )
}
