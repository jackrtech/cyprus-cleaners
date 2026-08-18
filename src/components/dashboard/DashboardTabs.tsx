'use client'

import { useRef } from 'react'
import { Link } from '@/navigation'

export interface DashboardTabItem {
  key:   string
  label: string
  count?: number
  // When set, this tab navigates to a different page instead of switching
  // an in-page panel (e.g. Earnings, which is its own route) — rendered as
  // a Link rather than a button, same visual treatment either way.
  href?: string
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
      className="flex bg-white dark:bg-[#16211F] border border-[#E0EDEC] dark:border-[#253634] rounded-full p-1 mb-6"
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey
        const className = `flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-colors ${
          isActive ? 'bg-[#19706A] text-white' : 'text-[#5B7472] dark:text-[#9BB0AE] hover:text-[#0D1F1E] dark:hover:text-[#ECF3F2]'
        }`
        const countBadge = !!tab.count && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              isActive ? 'bg-white/20 dark:bg-[#16211F]/20 text-white' : 'bg-[#E8F4F3] dark:bg-[#17302D] text-[#19706A]'
            }`}
          >
            {tab.count}
          </span>
        )

        // href tabs navigate to their own page (e.g. Earnings) rather than
        // switching an in-page panel — same look, nav-link semantics instead
        // of tab-panel semantics.
        if (tab.href) {
          return (
            <Link key={tab.key} href={tab.href} aria-current={isActive ? 'page' : undefined} className={className}>
              {tab.label}
              {countBadge}
            </Link>
          )
        }

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
            className={className}
          >
            {tab.label}
            {countBadge}
          </button>
        )
      })}
    </div>
  )
}
