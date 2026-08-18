'use client'

import ChatPanel from './ChatPanel'
import FullScreenModal from '@/components/ui/FullScreenModal'

interface Props {
  isOpen:            boolean
  onClose:           () => void
  introductionId:    string
  currentUserId:     string
  currentUserRole:   'CUSTOMER' | 'CLEANER'
  otherPartyName:    string
  otherPartyAvatar:  string | null
  hourlyRateEur?:    number | null
  bookingFeeEur?:    number | null
  initialShowBookingForm?: boolean
}

export default function ChatModal({
  isOpen, onClose, introductionId, currentUserId, currentUserRole, otherPartyName, otherPartyAvatar,
  hourlyRateEur, bookingFeeEur, initialShowBookingForm,
}: Props) {
  return (
    <FullScreenModal isOpen={isOpen} onClose={onClose}>
      <ChatPanel
        introductionId={introductionId}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        otherPartyName={otherPartyName}
        otherPartyAvatar={otherPartyAvatar}
        hourlyRateEur={hourlyRateEur}
        bookingFeeEur={bookingFeeEur}
        onClose={onClose}
        initialShowBookingForm={initialShowBookingForm}
      />
    </FullScreenModal>
  )
}
