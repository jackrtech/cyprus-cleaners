'use client'

import { useRef } from 'react'

export interface DashboardTabItem {
  key:   string
  label: string
  count?: number
}

interface DashboardTabsProps {
  tabs:      DashboardTabItem[]
  activeKey: string
  onChange:  (key: string) => void
  idPrefix:  string
  ariaLabel: string
}

export default function DashboardTabs({ tabs, activeKey, onChange, idPrefix, ariaLabel }: DashboardTabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusAndActivate(key: string) {
    onChange(key)
    tabRefs.current[key]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex(tab => tab.key === activeKey)
    if (idx === -1) return

    let nextIdx: number | null = null
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIdx = 0
    else if (e.key === 'End') nextIdx = tabs.length - 1

    if (nextIdx !== null) {
      e.preventDefault()
      focusAndActivate(tabs[nextIdx].key)
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className="flex bg-white border border-[#E0EDEC] rounded-full p-1 mb-6"
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        return (
          <button
            key={tab.key}
            ref={el => { tabRefs.current[tab.key] = el }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-colors ${
              isActive ? 'bg-[#19706A] text-white' : 'text-[#6B8886] hover:text-[#0D1F1E]'
            }`}
          >
            {tab.label}
            {!!tab.count && (
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#E8F4F3] text-[#19706A]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
