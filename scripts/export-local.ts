import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DictionaryFile, DictWord } from '../src/lib/dictionary'
import {
  ensureFreqArchive,
  findDataFile,
  mergeHomographs,
  parseFreqRanks,
  prepare,
  type JmdictFile,
  type PreparedEntry,
} from './lib/jmdict-source'
import { keepSense, resolveWordPos } from './lib/app-filter'
import { assignUsageRanks, ensureUsageFreqCsv, parseUsageFreqCsv } from './lib/usage-rank'

/**
 * DB 없이 로컬 JMdict 파일에서 앱용 정적 JSON(public/data/words.json)을 뽑는다.
 *
 * 원래 경로는 DB(작성·검수) → 정적 JSON 이지만, DB를 띄우지 않고도 화면을
 * 확인할 수 있게 하는 지름길이다. 표제어 선택·병합·빈도 환산은 data:import,
 * data:freq, data:usage 와 같은 함수를 쓰므로 DB에 들어가는 것과 같은 단어가 같은 순서로 나온다.
 *
 * 한국어 뜻은 DB에만 생기므로 여기서 나오는 뜻은 JMdict 영어 gloss다.
 */

const OUT_DIR = join(process.cwd(), 'public', 'data')
const OUT_PATH = join(OUT_DIR, 'words.json')

/** 남는 뜻이 없으면 null — 한 글자 조사(の, は, を …)처럼 앱에 싣지 않는 단어다(scripts/lib/app-filter.ts). */
function toDictWord(entry: PreparedEntry, rank: number | null): DictWord | null {
  // 이 경로에는 한국어 뜻이 없어 품사로만 거른다.
  const kept = entry.senses.filter((s) => keepSense(entry.lemma, entry.pos, { pos: s.pos, koGlosses: undefined }))
  if (kept.length === 0) return null
  const pos = resolveWordPos(entry.pos, kept.map((s) => s.pos))
  return {
    id: entry.jmdictSeq,
    lemma: entry.lemma,
    reading: entry.reading,
    pos,
    rank,
    senses: kept.map((s) => ({
      // DB 임포트와 같은 규칙 — 단어 전체 품사와 다를 때만 남긴다.
      ...(s.pos !== pos && { pos: s.pos }),
      meanings: { en: { glosses: s.glosses, ...(s.note !== null && { note: s.note }) } },
    })),
  }
}

async function main() {
  const path = findDataFile()
  console.log(`읽는 중: ${path}`)
  const data = JSON.parse(readFileSync(path, 'utf8')) as JmdictFile
  console.log(`  JMdict ${data.version} / ${data.dictDate} / ${data.words.length}개 엔트리`)

  const converted = data.words.map(prepare).filter((e): e is PreparedEntry => e !== null)
  const { merged, collisions } = mergeHomographs(converted)
  console.log(`  표제어 ${merged.length}개 (동형이의어 병합 ${collisions.length}개)`)

  console.log('빈도 태그 파싱 중...')
  const newsRanks = parseFreqRanks(await ensureFreqArchive())

  console.log('실사용 빈도 목록 읽는 중...')
  const usageRanks = assignUsageRanks(
    merged.map((e) => ({
      id: e.jmdictSeq,
      lemma: e.lemma,
      reading: e.reading,
      usuallyKana: e.senses[0]?.miscTags?.includes('uk') ?? false,
    })),
    parseUsageFreqCsv(await ensureUsageFreqCsv()),
  )

  // 학습 순서는 src/db/order.ts 와 같다 — 실사용 빈도, 신문 빈도, jmdict_seq 순.
  const order = (e: PreparedEntry) => [
    usageRanks.get(e.jmdictSeq) ?? Infinity,
    newsRanks.get(e.jmdictSeq) ?? Infinity,
    e.jmdictSeq,
  ]
  const dictWords = merged
    .map((e) => ({ e, key: order(e) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2])
    .map(({ e }) => toDictWord(e, usageRanks.get(e.jmdictSeq) ?? null))
    .filter((w): w is DictWord => w !== null)

  const out: DictionaryFile = {
    source: `JMdict ${data.dictDate} (jmdict-simplified ${data.version})`,
    generatedAt: new Date().toISOString(),
    words: dictWords,
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const json = JSON.stringify(out)
  writeFileSync(OUT_PATH, json)

  const ranked = dictWords.filter((w) => w.rank !== null).length
  console.log(`\n${OUT_PATH}`)
  console.log(`  ${dictWords.length}개 단어, 순위 있음 ${ranked}개`)
  console.log(`  ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
