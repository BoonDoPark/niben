import 'dotenv/config'

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../src/db'
import { partOfSpeechLabels } from '../src/db/labels'
import { learningOrder } from '../src/db/order'
import { examples, exampleTranslations, senses, senseTranslations, words } from '../src/db/schema'
import { STUDY_RANGE } from '../src/lib/dictionary'
import { keepSense } from './lib/app-filter'

/**
 * 예문 만들기. 앱에 나오는 학습 순서 상위 STUDY_RANGE 단어의 앞쪽 뜻(최대 SENSES_PER_WORD개)마다 예문을 하나씩 둔다.
 * 예문마다 일본어 원문·가나 읽기와 화면 언어(ko, en, es) 번역을 함께 만든다.
 *
 * 번역(translate.ts)과 같은 흐름이다. 요청을 파일로 뽑고(--dump), 다른 도구에서 쓴 결과를 넣는다(--load).
 * 이미 예문이 있는 뜻은 뽑지도 넣지도 않으므로 몇 번이든 다시 돌릴 수 있다.
 *
 *   npm run examples -- --dump <디렉터리> [--batch 25]
 *   npm run examples -- --load <디렉터리 또는 파일>
 *
 * 이미 있는 예문에 번역 언어 하나를 더할 때(예: 화면 언어를 새로 추가했을 때):
 *   npm run examples -- --translate-dump <디렉터리> --lang es   그 언어 번역이 없는 예문을 뽑기
 *   npm run examples -- --translate-load <디렉터리> --lang es   batch-NNN.json 의 번역을 넣기
 */

const SENSES_PER_WORD = 2
const DEFAULT_WORDS_PER_BATCH = 25
const EXAMPLE_LANGS = ['ko', 'en', 'es'] as const
type ExampleLang = (typeof EXAMPLE_LANGS)[number]

export const EXAMPLE_PROMPT = `당신은 일본어 단어장의 예문 작가다. 표제어마다 [senseId]가 붙은 뜻에 예문을 하나씩 쓴다.
"-"로 시작하는 줄은 같은 단어의 다른 뜻이다. 예문이 그 뜻과 헷갈리지 않게 하는 데만 참고한다.

## 일본어 예문(ja)

- 그 뜻으로 쓰인 자연스러운 문장 하나. 실제로 쓰는 말투로, 10~30자 정도로 짧게 쓴다.
- 표제어를 반드시 넣는다. 활용형은 괜찮고, 표기는 표제어 표기(한자·가나)를 따른다.
- 그 뜻이 드러나는 문맥을 만든다. 다른 뜻으로도 읽히는 문장은 피한다.
- 예문 속 다른 낱말은 쉬운 말로 쓴다. 실존 인물, 어려운 고유명사는 쓰지 않는다.
- 사전·코퍼스(Tatoeba 등)의 문장을 옮기지 말고 새로 쓴다.
- 비속어·성적 표현인 뜻은 담백하고 점잖은 문장으로 쓴다.
- 조사·접미사·조동사처럼 문법 요소인 뜻은 그 쓰임이 잘 보이는 전형적인 문장으로 쓴다(さん → 田中さんは先生です。).

## 읽기(reading)

문장 전체를 가나로 쓴다. 한자는 히라가나로 바꾸고, 가타카나 낱말은 가타카나 그대로 둔다. 문장부호는 그대로, 띄어쓰기는 하지 않는다.

## 번역(ko, en, es)

- 예문 전체를 자연스럽게 옮긴다. 표제어 부분은 줄에 적힌 그 언어의 뜻과 맞춘다.
- ko: 자연스러운 한국어 문장.
- en: 자연스러운 영어 문장.
- es: 중남미에서 쓰는 자연스러운 스페인어 문장(computadora, celular 등). 강세 부호를 바르게 쓴다.

## 출력

[senseId]가 있는 뜻마다 하나씩, 하나도 빠뜨리지 않는다.
{"examples":[{"senseId":123,"ja":"…","reading":"…","ko":"…","en":"…","es":"…"}]}`

export const ExampleBatchSchema = z.object({
  examples: z.array(
    z.object({
      senseId: z.number().int(),
      ja: z.string().min(1),
      reading: z.string().min(1),
      ko: z.string().min(1),
      en: z.string().min(1),
      es: z.string().min(1),
    }),
  ),
})

type Options = {
  dump: string | null
  load: string | null
  translateDump: string | null
  translateLoad: string | null
  lang: ExampleLang
  wordsPerBatch: number
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dump: null,
    load: null,
    translateDump: null,
    translateLoad: null,
    lang: 'es',
    wordsPerBatch: DEFAULT_WORDS_PER_BATCH,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dump') opts.dump = argv[++i]
    else if (arg === '--load') opts.load = argv[++i]
    else if (arg === '--batch') opts.wordsPerBatch = Number(argv[++i])
    else if (arg === '--translate-dump') opts.translateDump = argv[++i]
    else if (arg === '--translate-load') opts.translateLoad = argv[++i]
    else if (arg === '--lang') {
      const lang = argv[++i]
      if (!(EXAMPLE_LANGS as readonly string[]).includes(lang)) throw new Error(`--lang 은 ${EXAMPLE_LANGS.join(' | ')} 중 하나입니다`)
      opts.lang = lang as ExampleLang
    }
    else throw new Error(`알 수 없는 인자: ${arg}`)
  }
  const modes = [opts.dump, opts.load, opts.translateDump, opts.translateLoad].filter(Boolean)
  if (modes.length !== 1) throw new Error('--dump, --load, --translate-dump, --translate-load 중 하나를 넘기세요')
  return opts
}

type TargetWord = {
  lemma: string
  reading: string
  posLabel: string
  senses: Array<{ id: number; target: boolean; meanings: Partial<Record<ExampleLang, string>> }>
}

/**
 * 앱과 같은 기준으로 상위 STUDY_RANGE 단어를 고른다(data:export 와 같은 학습 순서, 같은 뜻 거르기).
 * 단어마다 앱에 보이는 뜻 중 앞쪽 SENSES_PER_WORD개가 예문 대상이고, 이미 예문이 있는 뜻은 뺀다.
 */
async function findTargets(): Promise<TargetWord[]> {
  const wordRows = await db
    .select({ id: words.id, lemma: words.lemma, reading: words.reading, pos: words.pos })
    .from(words)
    .orderBy(...learningOrder)
  const senseRows = await db
    .select({ id: senses.id, wordId: senses.wordId, pos: senses.pos })
    .from(senses)
    .orderBy(asc(senses.wordId), asc(senses.orderNo))
  const glossRows = await db
    .select({ senseId: senseTranslations.senseId, lang: senseTranslations.lang, glosses: senseTranslations.glosses })
    .from(senseTranslations)
    .where(inArray(senseTranslations.lang, [...EXAMPLE_LANGS]))
  const withExample = new Set(
    (await db.selectDistinct({ senseId: examples.senseId }).from(examples)).map((r) => r.senseId),
  )

  const glosses = new Map<number, Partial<Record<ExampleLang, string[]>>>()
  for (const g of glossRows) {
    const m = glosses.get(g.senseId) ?? {}
    m[g.lang as ExampleLang] = g.glosses
    glosses.set(g.senseId, m)
  }
  const sensesByWord = new Map<number, typeof senseRows>()
  for (const s of senseRows) {
    const list = sensesByWord.get(s.wordId) ?? []
    list.push(s)
    sensesByWord.set(s.wordId, list)
  }

  const targets: TargetWord[] = []
  let appWords = 0
  for (const w of wordRows) {
    if (appWords >= STUDY_RANGE) break
    const kept = (sensesByWord.get(w.id) ?? []).filter((s) =>
      keepSense(w.lemma, w.pos, { pos: s.pos, koGlosses: glosses.get(s.id)?.ko }),
    )
    if (kept.length === 0) continue
    appWords++
    const senseList = kept.map((s, i) => {
      const g = glosses.get(s.id) ?? {}
      return {
        id: s.id,
        target: i < SENSES_PER_WORD && !withExample.has(s.id),
        meanings: {
          ko: g.ko?.join(', '),
          en: g.en?.join('; '),
          es: g.es?.join(', '),
        },
      }
    })
    if (!senseList.some((s) => s.target)) continue
    targets.push({ lemma: w.lemma, reading: w.reading, posLabel: partOfSpeechLabels[w.pos], senses: senseList })
  }
  return targets
}

function formatWord(w: TargetWord): string {
  const title = w.lemma === w.reading ? `### ${w.lemma} · ${w.posLabel}` : `### ${w.lemma} (${w.reading}) · ${w.posLabel}`
  const lines = w.senses.map((s, i) => {
    const m = `ko: ${s.meanings.ko ?? '-'} | en: ${s.meanings.en ?? '-'} | es: ${s.meanings.es ?? '-'}`
    return s.target ? `[${s.id}] ${m}` : `- (뜻 ${i + 1}) ${m}`
  })
  return [title, ...lines].join('\n')
}

async function dump(dir: string, wordsPerBatch: number) {
  const targets = await findTargets()
  const total = targets.reduce((n, w) => n + w.senses.filter((s) => s.target).length, 0)
  if (targets.length === 0) {
    console.log('예문을 만들 뜻이 없습니다.')
    return
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'system-prompt.txt'), EXAMPLE_PROMPT)
  let batchNo = 0
  for (let i = 0; i < targets.length; i += wordsPerBatch) {
    const batch = targets.slice(i, i + wordsPerBatch)
    const count = batch.reduce((n, w) => n + w.senses.filter((s) => s.target).length, 0)
    batchNo++
    const body = [`아래 ${batch.length}개 표제어, ${count}개 뜻에 예문을 하나씩 써라.`, '', batch.map(formatWord).join('\n\n')]
    writeFileSync(join(dir, `batch-${String(batchNo).padStart(3, '0')}.txt`), body.join('\n'))
  }
  console.log(`표제어 ${targets.length}개 / 예문 ${total}개 → ${dir} 에 묶음 ${batchNo}개를 썼습니다.`)
  console.log('결과는 batch-NNN.json 으로 저장한 뒤 --load 로 넣으세요.')
}

async function load(path: string) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(path, f))
    : [path]
  const items = files.flatMap((f) => ExampleBatchSchema.parse(JSON.parse(readFileSync(f, 'utf8'))).examples)
  console.log(`파일 ${files.length}개에서 예문 ${items.length}개를 읽었습니다.`)

  const ids = [...new Set(items.map((e) => e.senseId))]
  const known = new Set(
    ids.length === 0
      ? []
      : (await db.select({ id: senses.id }).from(senses).where(inArray(senses.id, ids))).map((r) => r.id),
  )
  const existing = new Set(
    ids.length === 0
      ? []
      : (
          await db.selectDistinct({ senseId: examples.senseId }).from(examples).where(inArray(examples.senseId, ids))
        ).map((r) => r.senseId),
  )

  let inserted = 0
  let skipped = 0
  await db.transaction(async (tx) => {
    for (const e of items) {
      if (!known.has(e.senseId) || existing.has(e.senseId)) {
        skipped++
        continue
      }
      const [row] = await tx
        .insert(examples)
        .values({ senseId: e.senseId, orderNo: 0, ja: e.ja, reading: e.reading, source: 'llm', verified: false })
        .returning({ id: examples.id })
      await tx.insert(exampleTranslations).values(
        EXAMPLE_LANGS.map((lang) => ({ exampleId: row.id, lang, text: e[lang], source: 'llm' as const, verified: false })),
      )
      existing.add(e.senseId)
      inserted++
    }
  })
  console.log(`  예문 ${inserted}개 삽입`)
  if (skipped) console.log(`  DB에 없는 뜻이거나 이미 예문이 있어 건너뜀 ${skipped}개`)
}


const TRANSLATIONS_PER_BATCH = 60
const LANG_NAMES: Record<ExampleLang, string> = { ko: '한국어', en: '영어', es: '스페인어(중남미)' }

export const ExampleTranslationBatchSchema = z.object({
  translations: z.array(z.object({ exampleId: z.number().int(), text: z.string().min(1) })),
})

function translatePrompt(lang: ExampleLang): string {
  return `당신은 일본어 단어장의 예문 번역가다. [exampleId]가 붙은 일본어 예문을 ${LANG_NAMES[lang]}로 옮긴다.
줄마다 일본어 원문(ja), 그 예문이 보여주는 표제어와 뜻(word), 이미 있는 한국어(ko)·영어(en) 번역이 있다.

- 일본어 원문을 자연스러운 ${LANG_NAMES[lang]} 문장 하나로 옮긴다. 한국어·영어 번역은 뜻을 확인하는 참고로만 쓰고, 영어 문장을 그대로 옮기지 않는다.
- 표제어 부분은 word 에 적힌 ${LANG_NAMES[lang]} 뜻과 맞춘다.${lang === 'es' ? `
- 중남미에서 널리 쓰는 말(computadora, celular, carro/auto, jugo)을 쓰고, 스페인에서만 쓰는 말(ordenador, móvil, coche, zumo)은 피한다.
- 강세 부호·ñ·¿¡ 를 바르게 쓴다. 일본 이름은 로마자(Tanaka), 지명은 스페인어 이름이 있으면 그것(Tokio, Japón).` : ''}
- 번역 문장 안에 일본어 문자를 넣지 않는다.

## 출력

[exampleId]마다 하나씩, 하나도 빠뜨리지 않는다.
{"translations":[{"exampleId":123,"text":"…"}]}`
}

/** 그 언어 번역이 없는 예문을 묶음 파일로 뽑는다. */
async function translateDump(dir: string, lang: ExampleLang) {
  const rows = await db
    .select({ id: examples.id, senseId: examples.senseId, ja: examples.ja })
    .from(examples)
    .orderBy(asc(examples.id))
  const texts = await db
    .select({ exampleId: exampleTranslations.exampleId, lang: exampleTranslations.lang, text: exampleTranslations.text })
    .from(exampleTranslations)
  const byExample = new Map<number, Partial<Record<string, string>>>()
  for (const t of texts) byExample.set(t.exampleId, { ...byExample.get(t.exampleId), [t.lang]: t.text })
  const pending = rows.filter((r) => !byExample.get(r.id)?.[lang])
  if (pending.length === 0) {
    console.log(`${LANG_NAMES[lang]} 번역이 없는 예문이 없습니다.`)
    return
  }
  // 예문이 보여주는 표제어와 그 언어 뜻(있으면)을 함께 실어 표제어 번역을 뜻과 맞추게 한다.
  const senseIds = [...new Set(pending.map((r) => r.senseId))]
  const senseRows = await db
    .select({ id: senses.id, lemma: words.lemma })
    .from(senses)
    .innerJoin(words, eq(words.id, senses.wordId))
    .where(inArray(senses.id, senseIds))
  const lemmaOf = new Map(senseRows.map((r) => [r.id, r.lemma]))
  const glossRows = await db
    .select({ senseId: senseTranslations.senseId, lang: senseTranslations.lang, glosses: senseTranslations.glosses })
    .from(senseTranslations)
    .where(and(inArray(senseTranslations.senseId, senseIds), inArray(senseTranslations.lang, [lang, 'en'])))
  const glossOf = new Map<number, Partial<Record<string, string>>>()
  for (const g of glossRows) glossOf.set(g.senseId, { ...glossOf.get(g.senseId), [g.lang]: g.glosses.join(', ') })

  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'system-prompt.txt'), translatePrompt(lang))
  let batchNo = 0
  for (let i = 0; i < pending.length; i += TRANSLATIONS_PER_BATCH) {
    const batch = pending.slice(i, i + TRANSLATIONS_PER_BATCH)
    batchNo++
    const lines = batch.map((r) => {
      const t = byExample.get(r.id) ?? {}
      const g = glossOf.get(r.senseId) ?? {}
      return `[${r.id}] ja: ${r.ja} | word: ${lemmaOf.get(r.senseId) ?? '-'} = ${g[lang] ?? g.en ?? '-'} | ko: ${t.ko ?? '-'} | en: ${t.en ?? '-'}`
    })
    const body = [`아래 예문 ${batch.length}개를 ${LANG_NAMES[lang]}로 옮겨라.`, '', ...lines]
    writeFileSync(join(dir, `batch-${String(batchNo).padStart(3, '0')}.txt`), body.join('\n'))
  }
  console.log(`예문 ${pending.length}개 → ${dir} 에 묶음 ${batchNo}개를 썼습니다.`)
}

/** 번역 결과를 넣는다. 이미 그 언어 번역이 있는 예문은 건너뛴다. */
async function translateLoad(path: string, lang: ExampleLang) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(path, f))
    : [path]
  const items = files.flatMap(
    (f) => ExampleTranslationBatchSchema.parse(JSON.parse(readFileSync(f, 'utf8'))).translations,
  )
  const ids = [...new Set(items.map((t) => t.exampleId))]
  const known = new Set(
    ids.length === 0
      ? []
      : (await db.select({ id: examples.id }).from(examples).where(inArray(examples.id, ids))).map((r) => r.id),
  )
  const rows = items
    .filter((t) => known.has(t.exampleId))
    .map((t) => ({ exampleId: t.exampleId, lang, text: t.text, source: 'llm' as const, verified: false }))
  let inserted = 0
  for (let i = 0; i < rows.length; i += 1000) {
    const res = await db
      .insert(exampleTranslations)
      .values(rows.slice(i, i + 1000))
      .onConflictDoNothing()
      .returning({ id: exampleTranslations.id })
    inserted += res.length
  }
  console.log(`파일 ${files.length}개에서 번역 ${items.length}개를 읽었습니다.`)
  console.log(`  ${LANG_NAMES[lang]} 예문 번역 ${inserted}개 삽입`)
  if (rows.length > inserted) console.log(`  이미 있어 건너뜀 ${rows.length - inserted}개`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.dump) await dump(opts.dump, opts.wordsPerBatch)
  if (opts.load) await load(opts.load)
  if (opts.translateDump) await translateDump(opts.translateDump, opts.lang)
  if (opts.translateLoad) await translateLoad(opts.translateLoad, opts.lang)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

