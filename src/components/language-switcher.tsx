'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/config'

/** 1년. 다음에 주소 없이(/) 들어와도 고른 언어로 가도록 proxy가 이 쿠키를 먼저 본다. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** 지금 주소에서 언어 부분(/ko)만 바꾼 주소. /ko/words → /en/words */
function swapLocale(pathname: string, locale: Locale): string {
  const [, , ...rest] = pathname.split('/')
  return `/${[locale, ...rest].filter(Boolean).join('/')}`
}

/**
 * 오른쪽 위 언어 선택. 평소엔 지금 언어 하나만 보이고, 누르면 아래로 목록이 펼쳐진다.
 * 목록은 높이를 정해 두고 그 안에서 스크롤하므로 언어가 늘어도 화면을 덮지 않는다.
 */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  // 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${label}: ${LOCALE_NAMES[locale]}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full bg-zinc-100 py-1.5 pr-2.5 pl-3.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <span lang={locale}>{LOCALE_NAMES[locale]}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3.5 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <nav
          id={listId}
          aria-label={label}
          className="absolute top-full right-0 z-30 mt-2 max-h-56 w-40 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-1 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          {LOCALES.map((l) => (
            <Link
              key={l}
              href={swapLocale(pathname, l)}
              hrefLang={l}
              lang={l}
              aria-current={l === locale ? 'true' : undefined}
              onClick={() => {
                document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
                setOpen(false)
              }}
              className="flex items-center justify-between rounded-xl px-3 py-2.5 text-zinc-700 transition-colors hover:bg-zinc-100 aria-[current=true]:font-medium aria-[current=true]:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:aria-[current=true]:text-zinc-100"
            >
              {LOCALE_NAMES[l]}
              {l === locale && <span aria-hidden="true">✓</span>}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
