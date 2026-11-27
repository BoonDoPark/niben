import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { JlptLevel } from '../src/db/schema'
import type { GrammarEntry, GrammarFile, KanjiEntry, KanjiFile } from '../src/lib/study-data'
import { DATA_DIR } from './lib/jmdict-source'

/**
 * OpenJLPT(https://github.com/evanclan/OpenJLPT, CC BY-SA 4.0)의 한자·문법을 앱용 정적 JSON으로 뽑는다.
 * public/data/kanji.json, grammar.json. 레벨별 원본은 data/openjlpt/{kanji,grammar}/ 에 받아 둔다.
 *
 * 한자는 KANJIDIC2(EDRDG, CC BY-SA 4.0), 문법은 OpenJLPT 기여자 원문(CC BY-SA 4.0)이다.
 * 레벨은 Jonathan Waller의 커뮤니티 목록 기준이라 공식이 아니다. 설명은 영어 원문 그대로 싣는다.
 */

const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const BASE_URL = 'https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json'
const OUT_DIR = join(process.cwd(), 'public', 'data')
const SOURCE = 'OpenJLPT (CC BY-SA 4.0)'

type RawKanji = {
  character: string
  level: JlptLevel
  strokes: number
  grade?: number | null
  freq?: number | null
  radical: string
  onyomi?: string[]
  kunyomi?: string[]
  meanings?: string[]
  words?: string[]
}

async function loadLevels<T>(kind: 'kanji' | 'grammar'): Promise<T[]> {
  const dir = join(DATA_DIR, 'openjlpt', kind)
  mkdirSync(dir, { recursive: true })
  const all: T[] = []
  for (const level of LEVELS) {
    const path = join(dir, `${level.toLowerCase()}.json`)
    if (!existsSync(path)) {
      const url = `${BASE_URL}/${kind}/${level.toLowerCase()}.json`
      console.log(`내려받는 중: ${url}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url} (HTTP ${res.status})`)
      writeFileSync(path, await res.text())
    }
    all.push(...(JSON.parse(readFileSync(path, 'utf8')) as T[]))
  }
  return all
}

async function main() {
  const generatedAt = new Date().toISOString()
  mkdirSync(OUT_DIR, { recursive: true })

  const rawKanji = await loadLevels<RawKanji>('kanji')
  const kanji: KanjiEntry[] = rawKanji.map((k) => ({
    c: k.character,
    level: k.level,
    strokes: k.strokes,
    ...(k.grade ? { grade: k.grade } : {}),
    ...(k.freq ? { freq: k.freq } : {}),
    radical: k.radical,
    on: k.onyomi ?? [],
    kun: k.kunyomi ?? [],
    meanings: k.meanings ?? [],
    words: k.words ?? [],
  }))
  // 쉬운 레벨부터, 같은 레벨 안에서는 신문에 자주 나오는 한자부터. 빈도가 없는 한자는 뒤로.
  kanji.sort(
    (a, b) =>
      LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.freq ?? Infinity) - (b.freq ?? Infinity),
  )
  const kanjiFile: KanjiFile = { source: SOURCE, generatedAt, kanji }
  const kanjiJson = JSON.stringify(kanjiFile)
  writeFileSync(join(OUT_DIR, 'kanji.json'), kanjiJson)

  const rawGrammar = await loadLevels<GrammarEntry>('grammar')
  const grammar: GrammarEntry[] = rawGrammar.map((g) => ({
    id: g.id,
    pattern: g.pattern,
    level: g.level,
    romaji: g.romaji,
    meaning: g.meaning,
    formation: g.formation,
    ...(g.notes ? { notes: g.notes } : {}),
    tags: g.tags ?? [],
    examples: (g.examples ?? []).map((e) => ({ ja: e.ja, ...(e.furigana ? { furigana: e.furigana } : {}), en: e.en })),
  }))
  const grammarFile: GrammarFile = { source: SOURCE, generatedAt, grammar }
  const grammarJson = JSON.stringify(grammarFile)
  writeFileSync(join(OUT_DIR, 'grammar.json'), grammarJson)

  const count = (xs: Array<{ level: JlptLevel }>) => Object.fromEntries(LEVELS.map((l) => [l, xs.filter((x) => x.level === l).length]))
  const mb = (s: string) => `${(Buffer.byteLength(s) / 1024 / 1024).toFixed(2)} MB`
  console.log(`kanji.json: ${kanji.length}자`, count(kanji), mb(kanjiJson))
  console.log(`grammar.json: ${grammar.length}개`, count(grammar), mb(grammarJson))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
