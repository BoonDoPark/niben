import 'dotenv/config'

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from '@google/genai'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '../src/db'
import { learningOrder } from '../src/db/order'
import { senses, senseTranslations, words } from '../src/db/schema'
import {
  buildUserMessage,
  SYSTEM_PROMPT,
  TRANSLATION_JSON_SCHEMA,
  TRANSLATION_MODEL,
  TranslationBatchSchema,
  type SenseInput,
  type TranslationBatch,
  type WordInput,
} from '../src/lib/translation'

/**
 * 아직 한국어 뜻이 없는 표제어를 빈도 순으로 골라 번역해 넣는다.
 *
 * 임포트와 분리한 이유: 임포트는 결정적이라 몇 번이든 다시 돌릴 수 있지만 번역은 돈이 든다.
 * 한 스크립트에 묶으면 임포트를 재실행할 때마다 번역비가 나간다.
 *
 * 이미 한국어 뜻이 있는 sense는 건너뛰므로 중간에 끊겨도 이어서 실행하면 된다.
 * 손으로 고친 뜻도 덮이지 않는다.
 *
 * 사용:
 *   npm run translate -- --limit 100 --dry-run   프롬프트만 출력 (API 호출 없음)
 *   npm run translate -- --limit 2000            상위 2000 표제어 번역
 *
 * API 없이 (다른 도구에서 직접 번역):
 *   npm run translate -- --limit 100 --batch 50 --dump <디렉터리>   요청 본문을 파일로 뽑기
 *   npm run translate -- --load <디렉터리 또는 파일>               번역 결과 JSON 넣기
 */

const LANG = 'ko' as const
const DEFAULT_WORD_LIMIT = 200
const DEFAULT_WORDS_PER_REQUEST = 10
const DEFAULT_CONCURRENCY = 4

// Gemini Flash 유료 등급 단가 (USD / 100만 토큰). 3.5 Flash 기준 추정치라 참고용이다.
// 무료 등급 키로 돌리면 실제 청구액은 0이다. 사고(thinking) 토큰은 출력 단가로 청구된다.
const PRICE_INPUT = 1.5
const PRICE_OUTPUT = 9
const PRICE_CACHED_INPUT = 0.15

type Options = {
  limit: number
  wordsPerRequest: number
  concurrency: number
  dryRun: boolean
  /** 요청 본문을 이 디렉터리에 파일로 쓰고 끝낸다. API 없이 번역할 때 쓴다. */
  dump: string | null
  /** 번역 결과 JSON(파일 또는 디렉터리)을 검증해 넣고 끝낸다. */
  load: string | null
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    limit: DEFAULT_WORD_LIMIT,
    wordsPerRequest: DEFAULT_WORDS_PER_REQUEST,
    concurrency: DEFAULT_CONCURRENCY,
    dryRun: false,
    dump: null,
    load: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--limit') opts.limit = Number(argv[++i])
    else if (arg === '--batch') opts.wordsPerRequest = Number(argv[++i])
    else if (arg === '--concurrency') opts.concurrency = Number(argv[++i])
    else if (arg === '--dump') opts.dump = argv[++i]
    else if (arg === '--load') opts.load = argv[++i]
    else throw new Error(`알 수 없는 인자: ${arg}`)
  }
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) throw new Error('--limit 값이 잘못됐습니다')
  return opts
}

/** 아직 한국어 뜻이 없는 표제어를 학습 순서(src/db/order.ts)대로 고른다. */
async function findPendingWordIds(limit: number): Promise<number[]> {
  const ko = alias(senseTranslations, 'ko')

  const rows = await db
    .select({ wordId: words.id })
    .from(senses)
    .innerJoin(words, eq(words.id, senses.wordId))
    .leftJoin(ko, and(eq(ko.senseId, senses.id), eq(ko.lang, LANG)))
    .where(isNull(ko.id))
    // words.id 가 기본키라 같은 행의 다른 컬럼(순위)으로 정렬해도 GROUP BY 에 넣지 않아도 된다.
    .groupBy(words.id)
    .orderBy(...learningOrder)
    .limit(limit)

  return rows.map((r) => r.wordId)
}

/**
 * 표제어의 뜻을 한 번에 다 싣는다.
 *
 * 대상 표제어 중 일부 뜻만 미번역인 경우에도 전체를 보낸다. 이미 번역된 뜻이 있으면
 * 모델이 나머지를 그것과 구별되게 쓸 수 있기 때문이다. 삽입 단계에서 중복은 걸러진다.
 */
async function loadWords(wordIds: number[]): Promise<WordInput[]> {
  if (wordIds.length === 0) return []

  const rows = await db
    .select({
      wordId: words.id,
      lemma: words.lemma,
      reading: words.reading,
      pos: words.pos,
      conjugationClass: words.conjugationClass,
      freqRank: words.freqRank,
      senseId: senses.id,
      orderNo: senses.orderNo,
      sensePos: senses.pos,
      miscTags: senses.miscTags,
      fieldTags: senses.fieldTags,
      enGlosses: senseTranslations.glosses,
      enNote: senseTranslations.note,
    })
    .from(senses)
    .innerJoin(words, eq(words.id, senses.wordId))
    .innerJoin(
      senseTranslations,
      and(eq(senseTranslations.senseId, senses.id), eq(senseTranslations.lang, 'en')),
    )
    .where(inArray(words.id, wordIds))
    .orderBy(...learningOrder, asc(senses.orderNo))

  const byWord = new Map<number, WordInput>()
  for (const row of rows) {
    let word = byWord.get(row.wordId)
    if (!word) {
      word = {
        lemma: row.lemma,
        reading: row.reading,
        pos: row.pos,
        conjugationClass: row.conjugationClass,
        senses: [],
      }
      byWord.set(row.wordId, word)
    }
    const sense: SenseInput = {
      senseId: row.senseId,
      orderNo: row.orderNo,
      pos: row.sensePos,
      miscTags: row.miscTags,
      fieldTags: row.fieldTags,
      enGlosses: row.enGlosses,
      enNote: row.enNote,
    }
    word.senses.push(sense)
  }

  return [...byWord.values()]
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 요청을 concurrency 개씩만 동시에 띄운다. */
async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

type Usage = {
  /** 캐시되지 않은 입력 */
  input: number
  /** 암묵적 캐시로 싸게 처리된 입력 (시스템 프롬프트가 요청마다 같아서 생긴다) */
  cached: number
  /** 답변 + 사고 토큰 */
  output: number
}

function estimateCost(u: Usage): number {
  return (
    (u.input * PRICE_INPUT + u.cached * PRICE_CACHED_INPUT + u.output * PRICE_OUTPUT) / 1_000_000
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 429 응답 본문의 retryDelay("37s")를 읽는다. 없으면 1분. */
function retryDelayMs(message: string): number {
  const seconds = Number(/retryDelay\\?"?\s*:\s*\\?"?(\d+(?:\.\d+)?)s/.exec(message)?.[1])
  return (Number.isFinite(seconds) ? seconds + 1 : 60) * 1000
}

/** 응답 본문을 스키마로 검증한다. 비었거나, JSON이 잘렸거나, 형식이 다르면 null. */
function parseTranslationJson(text: string | undefined): TranslationBatch | null {
  if (!text) return null
  try {
    const result = TranslationBatchSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** 모델이 만든 번역을 DB 행으로 바꾼다. 어느 경로로 만들었든 'llm', 미검수로 들어간다. */
function toRows(translations: TranslationBatch['translations']) {
  return translations
    .filter((t) => t.glosses.length > 0)
    .map((t) => ({
      senseId: t.senseId,
      lang: LANG,
      glosses: t.glosses,
      note: t.note,
      source: 'llm' as const,
      verified: false,
    }))
}

/**
 * API를 거치지 않고 만든 번역(--dump 로 뽑은 요청을 다른 도구에서 번역한 결과)을 넣는다.
 *
 * API 응답과 같은 스키마로 검증하고, DB에 없는 senseId는 버린다.
 * 이미 한국어 뜻이 있는 sense는 API 경로와 마찬가지로 건드리지 않는다.
 */
async function loadTranslations(path: string) {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(path, f))
    : [path]

  const translations = files.flatMap(
    (f) => TranslationBatchSchema.parse(JSON.parse(readFileSync(f, 'utf8'))).translations,
  )
  console.log(`파일 ${files.length}개에서 번역 ${translations.length}개를 읽었습니다.`)

  const ids = [...new Set(translations.map((t) => t.senseId))]
  const known = new Set(
    ids.length === 0
      ? []
      : (await db.select({ id: senses.id }).from(senses).where(inArray(senses.id, ids))).map(
          (r) => r.id,
        ),
  )
  const rows = toRows(translations.filter((t) => known.has(t.senseId)))

  let inserted = 0
  for (const batch of chunk(rows, 1000)) {
    const result = await db
      .insert(senseTranslations)
      .values(batch)
      .onConflictDoNothing()
      .returning({ id: senseTranslations.id })
    inserted += result.length
  }

  console.log(`  한국어 뜻 ${inserted}개 삽입`)
  if (ids.length > known.size) console.log(`  DB에 없는 senseId ${ids.length - known.size}개는 버림`)
  if (rows.length > inserted) console.log(`  이미 한국어 뜻이 있어 건너뜀 ${rows.length - inserted}개`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.load) {
    await loadTranslations(opts.load)
    return
  }

  console.log(`대상 조회 중 (표제어 최대 ${opts.limit}개)...`)
  const wordIds = await findPendingWordIds(opts.limit)
  const wordList = await loadWords(wordIds)
  const senseCount = wordList.reduce((n, w) => n + w.senses.length, 0)

  if (wordList.length === 0) {
    console.log('번역할 표제어가 없습니다.')
    return
  }

  const batches = chunk(wordList, opts.wordsPerRequest)
  console.log(`  표제어 ${wordList.length}개 / 뜻 ${senseCount}개 → 요청 ${batches.length}건`)

  if (opts.dryRun) {
    console.log('\n=== 시스템 프롬프트 ===')
    console.log(SYSTEM_PROMPT)
    console.log('\n=== 첫 요청 본문 ===')
    console.log(buildUserMessage(batches[0]))
    console.log('\n(--dry-run: API를 호출하지 않았습니다)')
    return
  }

  if (opts.dump) {
    mkdirSync(opts.dump, { recursive: true })
    writeFileSync(join(opts.dump, 'system-prompt.txt'), SYSTEM_PROMPT)
    batches.forEach((batch, i) => {
      const name = `batch-${String(i + 1).padStart(3, '0')}.txt`
      writeFileSync(join(opts.dump!, name), buildUserMessage(batch))
    })
    console.log(`\n${opts.dump} 에 시스템 프롬프트와 요청 ${batches.length}건을 썼습니다.`)
    console.log('번역 결과는 batch-NNN.json 으로 저장한 뒤 --load 로 넣으세요.')
    return
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env.example을 참고하세요.')
  }

  // SDK 재시도(retryOptions)는 쓰지 않는다. 몇 번 다시 보냈는지 보이지 않는데,
  // 무료 등급에서는 실패한 요청도 하루 한도를 깎을 수 있어서 시도마다 세고 기록해야 한다.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const total: Usage = { input: 0, cached: 0, output: 0 }
  let sent = 0
  let inserted = 0
  let missing = 0
  let failed = 0
  let skipped = 0
  let done = 0
  let dailyQuotaHit = false

  /**
   * 배치 하나를 요청한다. 실패하면 null — 그 배치는 번역 없이 남아 다음 실행 때 다시 잡힌다.
   *
   * 무료 등급의 429는 두 종류다. 분당 한도는 서버가 알려준 시간만큼 기다리면 풀리지만,
   * 일일 한도(모델별 하루 20건 등)는 다음 날까지 안 풀리므로 남은 배치를 보내 봐야 소용없다.
   */
  async function requestBatch(batch: WordInput[]): Promise<GenerateContentResponse | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        sent++
        return await ai.models.generateContent({
          model: TRANSLATION_MODEL,
          contents: buildUserMessage(batch),
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseJsonSchema: TRANSLATION_JSON_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            maxOutputTokens: 16000,
          },
        })
      } catch (err) {
        // 연결 끊김(ECONNRESET 등)은 HTTP 응답이 없어 ApiError가 아니다.
        // 그대로 던지면 진행 중인 다른 배치까지 전부 버려지므로 여기서 몇 번 다시 보내고 넘긴다.
        if (!(err instanceof ApiError)) {
          const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : ''
          console.warn(`\n  경고: 네트워크 오류 (${String(err)} ${cause}) — 시도 ${attempt}/4`)
          if (attempt < 4) {
            await sleep(10_000 * attempt)
            continue
          }
          failed++
          return null
        }
        if (err.status === 429 && /PerDay/.test(err.message)) {
          dailyQuotaHit = true
          return null
        }
        if (err.status === 429 && attempt < 5) {
          await sleep(retryDelayMs(err.message))
          continue
        }
        // 과부하(503) 같은 일시 오류. 무료 한도를 아끼려고 재시도는 3번까지만 한다.
        if ([408, 500, 502, 503, 504].includes(err.status)) {
          console.warn(`\n  경고: HTTP ${err.status} — 시도 ${attempt}/4`)
          if (attempt < 4) {
            await sleep(20_000 * attempt)
            continue
          }
          failed++
          return null
        }
        failed++
        console.warn(`\n  경고: 요청 실패 (HTTP ${err.status}) — 건너뜀`)
        return null
      }
    }
  }

  await pool(batches, opts.concurrency, async (batch) => {
    if (dailyQuotaHit) {
      skipped++
      return
    }
    const response = await requestBatch(batch)
    if (!response) {
      if (dailyQuotaHit) skipped++
      return
    }

    const usage = response.usageMetadata
    const cached = usage?.cachedContentTokenCount ?? 0
    total.input += (usage?.promptTokenCount ?? 0) - cached
    total.cached += cached
    total.output += (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0)

    // 안전 필터에 막히거나 출력 한도에 걸리면 text가 없거나 JSON이 잘린다.
    // 이 배치는 건너뛰고, 다시 실행하면 재시도된다.
    const parsed = parseTranslationJson(response.text)
    if (!parsed) {
      failed++
      const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason
      console.warn(`\n  경고: 응답을 파싱하지 못했습니다 (finishReason=${reason})`)
      return
    }

    const expected = new Set(batch.flatMap((w) => w.senses.map((s) => s.senseId)))
    // 요청에 없던 senseId를 만들어 왔다면 버린다.
    const rows = toRows(parsed.translations.filter((t) => expected.has(t.senseId)))

    for (const t of rows) expected.delete(t.senseId)
    missing += expected.size

    if (rows.length > 0) {
      // 이미 한국어 뜻이 있으면(동시 실행, 손으로 넣은 것) 건드리지 않는다.
      await db.insert(senseTranslations).values(rows).onConflictDoNothing()
      inserted += rows.length
    }

    done++
    process.stdout.write(
      `\r  ${done}/${batches.length} 요청 · ${inserted}개 뜻 · $${estimateCost(total).toFixed(2)}`,
    )
  })

  console.log()
  console.log(`\n한국어 뜻 ${inserted}개 삽입 · API 요청 ${sent}건 보냄 (재시도와 한도 거절 포함)`)
  if (missing > 0) console.log(`  응답에서 누락된 뜻 ${missing}개 (다시 실행하면 재시도합니다)`)
  if (failed > 0) console.log(`  실패한 요청 ${failed}건 (다시 실행하면 재시도합니다)`)
  if (dailyQuotaHit) {
    console.log(`  하루 요청 한도에 걸려 멈췄습니다. 보내지 못한 요청 ${skipped}건은 한도가 풀린 뒤 다시 실행하면 이어집니다.`)
  }
  console.log(`\n토큰: 입력 ${total.input} · 캐시된 입력 ${total.cached} · 출력(사고 포함) ${total.output}`)
  console.log(`추정 비용 (유료 등급 기준): $${estimateCost(total).toFixed(2)}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
