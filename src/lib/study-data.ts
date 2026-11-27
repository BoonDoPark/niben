import type { JlptLevel } from '@/db/schema'

/**
 * 한자·문법 정적 데이터의 형태. scripts/import-openjlpt-extra.ts 가 OpenJLPT(CC BY-SA 4.0)에서 뽑아
 * public/data/kanji.json, grammar.json 으로 쓰고, 브라우저가 받아 쓴다.
 * 한자는 KANJIDIC2(EDRDG, CC BY-SA 4.0), 문법은 OpenJLPT 기여자가 쓴 글이다. 설명은 영어 원문이다.
 */

export type KanjiEntry = {
  c: string
  level: JlptLevel
  strokes: number
  /** 일본 학교 학년(1~6 상용 초등, 8 중등). 없으면 생략 */
  grade?: number
  /** 신문 빈도 순위(낮을수록 흔함). 없으면 생략 */
  freq?: number
  radical: string
  /** 음독(가타카나) */
  on: string[]
  /** 훈독(히라가나) */
  kun: string[]
  /** 영어 뜻 */
  meanings: string[]
  /** 이 한자가 들어간 대표 단어 */
  words: string[]
}

export type KanjiFile = { source: string; generatedAt: string; kanji: KanjiEntry[] }

export type GrammarExample = {
  ja: string
  /** "{先輩|せんぱい}に…" 꼴의 후리가나 표기. 없는 예문도 있다 */
  furigana?: string
  en: string
}

export type GrammarEntry = {
  id: string
  pattern: string
  level: JlptLevel
  romaji: string
  /** 영어 설명 */
  meaning: string
  /** 접속(만드는 법) */
  formation: string
  notes?: string
  tags: string[]
  examples: GrammarExample[]
}

export type GrammarFile = { source: string; generatedAt: string; grammar: GrammarEntry[] }

export const KANJI_PATH = '/data/kanji.json'
export const GRAMMAR_PATH = '/data/grammar.json'

/** "{先輩|せんぱい}に…" → [{ base, ruby }]. ruby 가 없는 조각은 글자 그대로다. */
export function parseFurigana(text: string): Array<{ base: string; ruby?: string }> {
  const parts: Array<{ base: string; ruby?: string }> = []
  const re = /\{([^|}]+)\|([^}]+)\}/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ base: text.slice(last, m.index) })
    parts.push({ base: m[1], ruby: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ base: text.slice(last) })
  return parts
}
