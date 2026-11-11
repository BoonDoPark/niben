'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, type Locale } from '@/i18n/config'

/** 1년. 다음에 주소 없이(/) 들어와도 고른 언어로 가도록 proxy가 이 쿠키를 먼저 본다. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** 지금 주소에서 언어 부분(/ko)만 바꾼 주소. /ko/words → /en/words */
function swapLocale(pathname: string, locale: Locale): string {
  const [, , ...rest] = pathname.split('/')
  return `/${[locale, ...rest].filter(Boolean).join('/')}`
}

export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname()

  return (
    <nav aria-label={label} className="flex items-center gap-1 text-sm">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={swapLocale(pathname, l)}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? 'true' : undefined}
          onClick={() => {
            document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
          }}
          className="rounded-full px-2.5 py-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 aria-[current=true]:bg-zinc-900 aria-[current=true]:text-white dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:aria-[current=true]:bg-zinc-100 dark:aria-[current=true]:text-zinc-900"
        >
          {LOCALE_NAMES[l]}
        </Link>
      ))}
    </nav>
  )
}
