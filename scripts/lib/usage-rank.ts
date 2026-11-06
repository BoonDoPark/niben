import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { DATA_DIR } from './jmdict-source'

/**
 * 실사용 빈도 순위(words.usage_rank) 계산.
 *
 * 출처: jiten.moe 전체 매체 빈도 목록(global). 애니·드라마·영화 자막, 소설, 만화, 게임 등
 * 1만 8천여 편을 형태소 분석하고 활용형을 기본형으로 되돌려 JMdict 단어 단위로 센 것이다.
 * 라이선스 CC BY-SA 4.0 — JMdict와 같아서 함께 배포할 수 있다. 화면에 출처를 표기한다.
 *
 * 왜 JMdict의 nf 태그 대신 이것인가: nf는 1990년대 마이니치신문 기사 빈도라 상위 2천 단어 중
 * 명사가 1,789개, 동사가 21개였다(食べる 1만 4천 번째). 학습 순서로 쓸 수 없었다.
 *
 * CSV 형식은 `Word,Form,Rank` 이다(Jiten.Core/YomitanHelper.cs 의 BuildFrequencyCsvRows).
 *  - 한자 표기 행: (한자 표기, 대표 가나 읽기, 그 표기의 순위)
 *  - 가나 표기 행: (가나, 가나, 그 표기의 순위). 같은 가나는 목록 전체에서 한 번만 나오고,
 *    그 가나를 쓰는 단어 중 가장 흔한 단어 하나의 것이다(ある는 有る의 것이지 或의 것이 아니다).
 */

export const USAGE_FREQ_URL = 'https://api.jiten.moe/api/frequency-list/download?downloadType=csv'
export const USAGE_FREQ_PATH = join(DATA_DIR, 'jiten', 'jiten_freq_global.csv')

/** CSV가 없으면 내려받는다. 16MB 정도다. */
export async function ensureUsageFreqCsv(): Promise<string> {
  if (existsSync(USAGE_FREQ_PATH)) return readFileSync(USAGE_FREQ_PATH, 'utf8')

  console.log(`빈도 목록 내려받는 중: ${USAGE_FREQ_URL}`)
  const res = await fetch(USAGE_FREQ_URL)
  if (!res.ok) throw new Error(`빈도 목록을 내려받지 못했습니다 (HTTP ${res.status})`)
  const text = await res.text()
  mkdirSync(dirname(USAGE_FREQ_PATH), { recursive: true })
  writeFileSync(USAGE_FREQ_PATH, text)
  return text
}

const CSV_ROW = /^("(?:[^"]|"")*"|[^,]*),("(?:[^"]|"")*"|[^,]*),(\d+)$/

function unquote(field: string): string {
  return field.startsWith('"') ? field.slice(1, -1).replace(/""/g, '"') : field
}

function formKey(text: string, reading: string): string {
  return `${text}\t${reading}`
}

/** (표기, 읽기) → 순위. 같은 조합이 여러 번 나오면 가장 좋은 순위를 쓴다. */
export function parseUsageFreqCsv(csv: string): Map<string, number> {
  const ranks = new Map<string, number>()
  // 줄 끝이 \r\n 이다.
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const m = CSV_ROW.exec(line)
    if (!m) continue
    const key = formKey(unquote(m[1]), unquote(m[2]))
    const rank = Number(m[3])
    const prev = ranks.get(key)
    if (prev === undefined || rank < prev) ranks.set(key, rank)
  }
  return ranks
}

export type RankTarget = {
  id: number
  lemma: string
  reading: string
  /** 첫 뜻에 uk(보통 가나로 씀) 태그가 있는가. */
  usuallyKana: boolean
}

/**
 * 단어마다 실사용 순위를 정한다. 찾지 못하면 결과에 없다.
 *
 * 1. 자기 표기 행(표제어, 읽기)의 순위를 쓴다. 食べる → (食べる, たべる).
 * 2. 가나 표기 행(읽기, 읽기)은 실제로 가나로 쓰이는 단어의 사용량이다(凄い보다 すごい가 훨씬 흔하다).
 *    다만 같은 읽기의 단어 여럿이 한 행을 공유하므로(ある: 有る·或) 읽기마다 한 단어에게만 준다.
 *    - 후보: 가나로 쓰는 단어(uk 태그 또는 가나 표제어). 후보가 없으면 그 읽기의 모든 단어.
 *    - 후보 중 자기 표기 순위가 가장 좋은 단어가 받는다. Jiten도 가장 흔한 단어에 그 행을 준다.
 *    받은 단어는 두 순위 중 좋은 쪽을 쓴다.
 */
export function assignUsageRanks(
  targets: readonly RankTarget[],
  freq: ReadonlyMap<string, number>,
): Map<number, number> {
  const own = new Map<number, number | undefined>()
  for (const t of targets) own.set(t.id, freq.get(formKey(t.lemma, t.reading)))

  const byReading = new Map<string, RankTarget[]>()
  for (const t of targets) {
    const list = byReading.get(t.reading) ?? []
    list.push(t)
    byReading.set(t.reading, list)
  }

  const ownRank = (t: RankTarget) => own.get(t.id) ?? Number.POSITIVE_INFINITY
  const kanaWinner = new Set<number>()
  for (const list of byReading.values()) {
    const kanaWords = list.filter((t) => t.usuallyKana || t.lemma === t.reading)
    const candidates = kanaWords.length > 0 ? kanaWords : list
    const winner = candidates.reduce((best, t) =>
      ownRank(t) < ownRank(best) || (ownRank(t) === ownRank(best) && t.id < best.id) ? t : best,
    )
    kanaWinner.add(winner.id)
  }

  const result = new Map<number, number>()
  for (const t of targets) {
    const ranks = [own.get(t.id)]
    if (kanaWinner.has(t.id)) ranks.push(freq.get(formKey(t.reading, t.reading)))
    const found = ranks.filter((r): r is number => r !== undefined)
    if (found.length > 0) result.set(t.id, Math.min(...found))
  }
  return result
}
