import 'dotenv/config'

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { asc, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../src/db'
import { partOfSpeechLabels } from '../src/db/labels'
import { learningOrder } from '../src/db/order'
import { examples, exampleTranslations, senses, senseTranslations, words } from '../src/db/schema'
import { STUDY_RANGE } from '../src/lib/dictionary'
import { keepSense } from './lib/app-filter'

/**
 * 예문 만들기. 앱에 나오는 학습 순서 상위 STUDY_RANGE 단어의 앞쪽 뜻(최대 SENSES_PER_WORD개)마다 예문을 하나씩 둔다.
 * 예문마다 일본어 원문·가나 읽기와 화면 언어(ko, en, la) 번역을 함께 만든다.
 *
 * 번역(translate.ts)과 같은 흐름이다. 요청을 파일로 뽑고(--dump), 다른 도구에서 쓴 결과를 넣는다(--load).
 * 이미 예문이 있는 뜻은 뽑지도 넣지도 않으므로 몇 번이든 다시 돌릴 수 있다.
 *
 *   npm run examples -- --dump <디렉터리> [--batch 25]
 *   npm run examples -- --load <디렉터리 또는 파일>
 */

const SENSES_PER_WORD = 2
const DEFAULT_WORDS_PER_BATCH = 25
const EXAMPLE_LANGS = ['ko', 'en', 'la'] as const

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

## 번역(ko, en, la)

- 예문 전체를 자연스럽게 옮긴다. 표제어 부분은 줄에 적힌 그 언어의 뜻과 맞춘다.
- ko: 자연스러운 한국어 문장.
- en: 자연스러운 영어 문장.
- la: 고전 라틴어 철자로 쓴다. 장음 기호(ā)·합자(æ)는 쓰지 않고, 자음 u는 v로 쓰고, 라틴어 낱말에는 j를 쓰지 않는다(iam).
  현대 문물은 줄에 적힌 라틴어 뜻과 같은 신라틴어를 쓴다. 일본 이름은 로마자로 쓴다(Tanaka).

## 출력

[senseId]가 있는 뜻마다 하나씩, 하나도 빠뜨리지 않는다.
{"examples":[{"senseId":123,"ja":"…","reading":"…","ko":"…","en":"…","la":"…"}]}`

export const ExampleBatchSchema = z.object({
  examples: z.array(
    z.object({
      senseId: z.number().int(),
      ja: z.string().min(1),
      reading: z.string().min(1),
      ko: z.string().min(1),
      en: z.string().min(1),
      la: z.string().min(1),
    }),
  ),
})

type Options = { dump: string | null; load: string | null; wordsPerBatch: number }

function parseArgs(argv: string[]): Options {
  const opts: Options = { dump: null, load: null, wordsPerBatch: DEFAULT_WORDS_PER_BATCH }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dump') opts.dump = argv[++i]
    else if (arg === '--load') opts.load = argv[++i]
    else if (arg === '--batch') opts.wordsPerBatch = Number(argv[++i])
    else throw new Error(`알 수 없는 인자: ${arg}`)
  }
  if (!opts.dump === !opts.load) throw new Error('--dump 또는 --load 중 하나를 넘기세요')
  return opts
}

type TargetWord = {
  lemma: string
  reading: string
  posLabel: string
  senses: Array<{ id: number; target: boolean; meanings: Partial<Record<'ko' | 'en' | 'la', string>> }>
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

  const glosses = new Map<number, Partial<Record<'ko' | 'en' | 'la', string[]>>>()
  for (const g of glossRows) {
    const m = glosses.get(g.senseId) ?? {}
    m[g.lang as 'ko' | 'en' | 'la'] = g.glosses
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
          la: g.la?.join(', '),
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
    const m = `ko: ${s.meanings.ko ?? '-'} | en: ${s.meanings.en ?? '-'} | la: ${s.meanings.la ?? '-'}`
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

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.dump) await dump(opts.dump, opts.wordsPerBatch)
  if (opts.load) await load(opts.load)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

