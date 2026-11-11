import type { Language } from '@/db/schema'

/**
 * 화면 언어 설정. 서버(proxy, 페이지)와 클라이언트(언어 선택, 목록) 양쪽에서 쓰므로
 * 서버 전용 코드를 import 하지 않는다. 문구 사전은 ./dictionaries 에 따로 둔다.
 *
 * 화면 언어(Locale)와 뜻 언어(Language)는 다른 개념이다. 한국어 화면도 번역 안 된 뜻은 영어로 보여준다.
 */

export const LOCALES = ['ko', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ko'

/** 언어 선택 메뉴에 그 언어 자체로 쓴 이름. */
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
}

/**
 * 화면 언어별 뜻 언어 우선순위. 뜻마다 앞에서부터 있는 언어 하나만 보여준다.
 * 한국어 화면이면 한국어 뜻만 보이고, 아직 번역되지 않은 뜻만 영어로 대신한다.
 */
export const MEANING_LANGUAGES: Record<Locale, readonly Language[]> = {
  ko: ['ko', 'en'],
  en: ['en'],
}

/** 사용자가 고른 언어를 기억하는 쿠키. proxy가 브라우저 언어보다 먼저 본다. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: string | undefined | null): value is Locale {
  return value !== undefined && value !== null && (LOCALES as readonly string[]).includes(value)
}

/**
 * Accept-Language 헤더에서 지원하는 언어를 고른다. 없으면 DEFAULT_LOCALE.
 * 예: "en-US,en;q=0.9,ko;q=0.8" → en
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean)
      return { lang: tag.toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q), index }
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
  return ranked.map((x) => x.lang).find(isLocale) ?? DEFAULT_LOCALE
}

/** "{n}개 단어" 같은 문구의 자리표시자를 채운다. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
