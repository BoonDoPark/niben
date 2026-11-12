'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { Locale } from '@/i18n/config'

export function NavTabs({
  locale,
  labels,
}: {
  locale: Locale
  labels: { nav: string; random: string; words: string }
}) {
  const pathname = usePathname()
  const home = `/${locale}`
  const words = `/${locale}/words`

  const tabs = [
    { href: home, label: labels.random, active: pathname === home },
    { href: words, label: labels.words, active: pathname.startsWith(words) },
  ]

  return (
    <nav aria-label={labels.nav} className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 aria-[current=page]:border-zinc-900 aria-[current=page]:text-zinc-900 dark:hover:text-zinc-100 dark:aria-[current=page]:border-zinc-100 dark:aria-[current=page]:text-zinc-100"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
