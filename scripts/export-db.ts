import 'dotenv/config'

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { asc, inArray } from 'drizzle-orm'

import { db } from '../src/db'
import { learningOrder } from '../src/db/order'
import { senses, senseTranslations, words, type Language, type PartOfSpeech } from '../src/db/schema'
import {
  hasKorean,
  hasMeaningIn,
  STUDY_RANGE,
  type DictionaryFile,
  type DictMeaning,
  type DictSense,
  type DictWord,
} from '../src/lib/dictionary'
import { isSingleKana, keepSense, resolveWordPos } from './lib/app-filter'

/**
 * DB의 사전 데이터를 앱용 정적 JSON(public/data/words.json)으로 뽑는다.
 *
 * README의 "PostgreSQL → 정적 JSON → 브라우저" 중 가운데 단계다. 앱은 런타임에 DB를
 * 보지 않으므로, 한국어 뜻을 새로 만들거나 고친 뒤에는 이걸 다시 돌려야 화면에 나온다.
 *
 * 한국어 뜻이 없는 sense는 영어 뜻만 실린다. 번역은 빈도 순으로 조금씩 채우는 것이라
 * 전부 끝날 때까지 기다리지 않고 있는 만큼 내보낸다.
 */

const OUT_DIR = join(process.cwd(), 'public', 'data')
const OUT_PATH = join(OUT_DIR, 'words.json')
/** 메인 화면(무작위 단어)용. 학습 순서 상위 STUDY_RANGE 단어만 담는다. 화면 언어별 거르기는 화면이 한다. */
const STUDY_OUT_PATH = join(OUT_DIR, 'study.json')
const EXPORTED_LANGS: Language[] = ['ko', 'en', 'la']

async function main() {
  console.log('DB에서 읽는 중...')

  const wordRows = await db
    .select({
      id: words.id,
      lemma: words.lemma,
      reading: words.reading,
      pos: words.pos,
      rank: words.usageRank,
    })
    .from(words)
    // 번역 대상 고르기와 같은 학습 순서. data:local 도 같은 규칙을 따른다.
    .orderBy(...learningOrder)

  const senseRows = await db
    .select({ id: senses.id, wordId: senses.wordId, pos: senses.pos })
    .from(senses)
    .orderBy(asc(senses.wordId), asc(senses.orderNo))

  const translationRows = await db
    .select({
      senseId: senseTranslations.senseId,
      lang: senseTranslations.lang,
      glosses: senseTranslations.glosses,
      note: senseTranslations.note,
    })
    .from(senseTranslations)
    .where(inArray(senseTranslations.lang, EXPORTED_LANGS))

  const meaningsBySense = new Map<number, DictSense['meanings']>()
  for (const t of translationRows) {
    if (t.glosses.length === 0) continue
    const meaning: DictMeaning = { glosses: t.glosses, ...(t.note && { note: t.note }) }
    const meanings = meaningsBySense.get(t.senseId) ?? {}
    meanings[t.lang] = meaning
    meaningsBySense.set(t.senseId, meanings)
  }

  // 한 글자 히라가나(の, は, を …)의 조사·어미 뜻은 앱에 싣지 않는다. scripts/lib/app-filter.ts 참고.
  const wordById = new Map(wordRows.map((w) => [w.id, w]))
  const sensesByWord = new Map<number, Array<{ pos: PartOfSpeech; meanings: DictSense['meanings'] }>>()
  for (const s of senseRows) {
    const meanings = meaningsBySense.get(s.id)
    const word = wordById.get(s.wordId)
    if (!meanings || !word) continue
    if (!keepSense(word.lemma, word.pos, { pos: s.pos, koGlosses: meanings.ko?.glosses })) continue
    const list = sensesByWord.get(s.wordId) ?? []
    list.push({ pos: s.pos ?? word.pos, meanings })
    sensesByWord.set(s.wordId, list)
  }

  const dictWords: DictWord[] = []
  const removed: string[] = []
  const trimmed: string[] = []
  for (const w of wordRows) {
    const kept = sensesByWord.get(w.id)
    if (!kept) {
      if (isSingleKana(w.lemma)) removed.push(w.lemma)
      continue
    }
    const pos = resolveWordPos(w.pos, kept.map((s) => s.pos))
    if (isSingleKana(w.lemma)) {
      trimmed.push(`${w.lemma}(${kept.map((s) => s.meanings.ko?.glosses[0] ?? s.meanings.en?.glosses[0]).join(', ')})`)
    }
    // 뜻 품사는 단어 품사와 다를 때만 싣는다(DictSense.pos 규칙).
    const wordSenses: DictSense[] = kept.map((s) => ({ ...(s.pos !== pos && { pos: s.pos }), meanings: s.meanings }))
    dictWords.push({ ...w, pos, senses: wordSenses })
  }

  const out: DictionaryFile = {
    source: 'niben DB (JMdict 기반)',
    generatedAt: new Date().toISOString(),
    words: dictWords,
  }

  const studyWords = dictWords.slice(0, STUDY_RANGE)
  const studyOut: DictionaryFile = { ...out, words: studyWords }

  mkdirSync(OUT_DIR, { recursive: true })
  const json = JSON.stringify(out)
  writeFileSync(OUT_PATH, json)
  const studyJson = JSON.stringify(studyOut)
  writeFileSync(STUDY_OUT_PATH, studyJson)

  const mb = (s: string) => `${(Buffer.byteLength(s) / 1024 / 1024).toFixed(1)} MB`
  const allSenses = dictWords.flatMap((w) => w.senses)
  const koSenses = allSenses.filter((s) => s.meanings.ko).length
  console.log(`\n${OUT_PATH}`)
  console.log(`  ${dictWords.length}개 단어 / ${allSenses.length}개 뜻`)
  console.log(`  한국어 뜻: ${dictWords.filter(hasKorean).length}개 단어 / ${koSenses}개 뜻`)
  console.log(
    `  라틴어 뜻: ${dictWords.filter((w) => hasMeaningIn(w, 'la')).length}개 단어 / ${allSenses.filter((s) => s.meanings.la).length}개 뜻`,
  )
  console.log(`  ${mb(json)}`)
  console.log(`${STUDY_OUT_PATH}`)
  console.log(
    `  상위 ${studyWords.length.toLocaleString()}단어 (한국어 뜻 있음 ${studyWords.filter(hasKorean).length}개) · ${mb(studyJson)}`,
  )
  console.log(`\n한 글자 히라가나 — 조사 뜻뿐이라 뺀 단어 ${removed.length}개: ${removed.join(' ')}`)
  console.log(`  조사 뜻만 빼고 남긴 단어 ${trimmed.length}개: ${trimmed.join(' ')}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
