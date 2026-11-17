import { NextResponse, type NextRequest } from 'next/server'

import { isLocale, LOCALE_COOKIE, LOCALES, pickLocale } from './i18n/config'

/**
 * 언어가 없는 주소(/, /words)를 언어 주소(/ko, /en/words)로 보낸다.
 * 언어는 사용자가 전에 고른 것(쿠키) → 브라우저 언어(Accept-Language) → 한국어 순으로 정한다.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasLocale = LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))
  if (hasLocale) return

  const saved = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = isLocale(saved) ? saved : pickLocale(request.headers.get('accept-language'))
  request.nextUrl.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(request.nextUrl)
}

export const config = {
  // Next 내부 파일(_next), API(/api), 사전 JSON(/data), 확장자가 있는 정적 파일(favicon.ico, *.svg)은 건드리지 않는다.
  matcher: ['/((?!_next|api/|data/|.*\\..*).*)'],
}
