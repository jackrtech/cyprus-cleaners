'use client'

import ChatPanel from './ChatPanel'

interface Props {
  isOpen:            boolean
  onClose:           () => void
  introductionId:    string
  currentUserId:     string
  currentUserRole:   'CUSTOMER' | 'CLEANER'
  otherPartyName:    string
  otherPartyAvatar:  string | null
}

export default function ChatModal({
  isOpen, onClose, introductionId, currentUserId, currentUserRole, otherPartyName, otherPartyAvatar,
}: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(13,31,30,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="card w-full max-w-[560px] max-h-[85vh] p-0 overflow-hidden">
        <ChatPanel
          introductionId={introductionId}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          otherPartyName={otherPartyName}
          otherPartyAvatar={otherPartyAvatar}
          onClose={onClose}
        />
      </div>
    </div>
  )
}
