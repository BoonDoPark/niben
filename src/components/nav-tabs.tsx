'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: '랜덤 50단어' },
  { href: '/words', label: '전체 단어' },
] as const

export function NavTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="화면 전환" className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 aria-[current=page]:border-zinc-900 aria-[current=page]:text-zinc-900 dark:hover:text-zinc-100 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:text-zinc-100"
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
