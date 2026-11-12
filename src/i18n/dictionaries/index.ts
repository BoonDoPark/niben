import 'server-only'

import type { WordRowText } from '@/components/word-row'

import { MEANING_LANGUAGES, type Locale } from '../config'
import type { Dictionary } from './ko'

/**
 * 화면 문구 사전을 불러온다. 서버에서만 쓴다 — 페이지가 필요한 문구를 클라이언트 컴포넌트에 props로 넘긴다.
 * 언어마다 따로 import 해서 한 언어의 문구만 읽는다.
 */
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  ko: () => import('./ko').then((m) => m.default),
  en: () => import('./en').then((m) => m.default),
  la: () => import('./la').then((m) => m.default),
}

export function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]()
}

export type { Dictionary }

/** 단어 한 줄(WordRow)에 넘길 화면 언어 정보. 두 페이지가 같은 것을 쓴다. */
export function toWordRowText(locale: Locale, dict: Dictionary): WordRowText {
  return { locale, meaningLanguages: MEANING_LANGUAGES[locale], pos: dict.pos, freq: dict.word.freq, study: dict.study }
}
