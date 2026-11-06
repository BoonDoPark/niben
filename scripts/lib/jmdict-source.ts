import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import {
  EXCLUDED_FORM_TAGS,
  toConjugationClass,
  toFreqRank,
  toPartOfSpeech,
} from '../../src/db/jmdict'
import type { PartOfSpeech } from '../../src/db/schema'

/**
 * JMdict 원본 파일을 읽고 우리 구조로 바꾸는 공용 로직.
 *
 * DB에 넣는 스크립트(data:import, data:freq)와 DB 없이 정적 JSON을 뽑는
 * 스크립트(data:local)가 함께 쓴다. 두 경로의 결과가 어긋나지 않도록
 * 표제어 선택·병합·빈도 환산은 여기 한 군데에만 둔다.
 */

export const DATA_DIR = join(process.cwd(), 'data')

// jmdict-simplified 3.6 구조에서 우리가 쓰는 부분만 추렸다.
type JmdictKanji = { common: boolean; text: string; tags: string[] }
type JmdictKana = { common: boolean; text: string; tags: string[]; appliesToKanji: string[] }
type JmdictGloss = { lang: string; text: string }
type JmdictSense = {
  partOfSpeech: string[]
  field: string[]
  misc: string[]
  info: string[]
  gloss: JmdictGloss[]
}
type JmdictEntry = {
  id: string
  kanji: JmdictKanji[]
  kana: JmdictKana[]
  sense: JmdictSense[]
}
export type JmdictFile = {
  version: string
  dictDate: string
  languages: string[]
  commonOnly: boolean
  words: JmdictEntry[]
}

export type PreparedSense = {
  orderNo: number
  pos: PartOfSpeech
  miscTags: string[] | null
  fieldTags: string[] | null
  glosses: string[]
  note: string | null
}

export type PreparedEntry = {
  jmdictSeq: number
  lemma: string
  reading: string
  pos: PartOfSpeech
  conjugationClass: ReturnType<typeof toConjugationClass>
  senses: PreparedSense[]
}

function usableForms<T extends { tags: string[] }>(forms: T[]): T[] {
  return forms.filter((f) => !f.tags.some((t) => EXCLUDED_FORM_TAGS.has(t)))
}

/**
 * 엔트리 하나에서 대표 표기와 읽기를 고른다.
 *
 * JMdict 엔트리에는 이체자와 이독이 여럿 들어 있지만(明日 = あした/あす/みょうにち)
 * 학습자에게는 대표형 하나면 된다. 그래서 엔트리당 words 한 행만 만든다.
 * 의미가 다른 동형이의어(生 = なま/せい)는 JMdict가 이미 별도 엔트리로 나눠두었다.
 */
function pickForms(entry: JmdictEntry): { lemma: string; reading: string } | null {
  const kanji = usableForms(entry.kanji)
  const kana = usableForms(entry.kana)
  if (kana.length === 0) return null

  const chosenKanji = kanji.find((k) => k.common) ?? kanji[0] ?? null

  const applicable = chosenKanji
    ? kana.filter(
        (k) => k.appliesToKanji.includes('*') || k.appliesToKanji.includes(chosenKanji.text),
      )
    : kana
  const pool = applicable.length > 0 ? applicable : kana
  const chosenKana = pool.find((k) => k.common) ?? pool[0]

  return {
    // 한자 표기가 없는 단어(ありがとう 등)는 표기와 읽기가 같은 값이 된다.
    lemma: chosenKanji?.text ?? chosenKana.text,
    reading: chosenKana.text,
  }
}

export function prepare(entry: JmdictEntry): PreparedEntry | null {
  const forms = pickForms(entry)
  if (!forms) return null

  const seq = Number(entry.id)
  if (!Number.isFinite(seq)) return null

  const preparedSenses: PreparedSense[] = []
  // 뜻 전체의 품사 태그를 모아서 단어 수준 품사·활용을 정한다.
  // 첫 뜻만 보면 "1번은 명사, 2번은 동사"인 단어의 활용을 놓친다.
  const allTags = new Set<string>()

  entry.sense.forEach((sense, index) => {
    const glosses = sense.gloss.filter((g) => g.lang === 'eng').map((g) => g.text)
    if (glosses.length === 0) return

    sense.partOfSpeech.forEach((t) => allTags.add(t))

    preparedSenses.push({
      orderNo: index,
      pos: toPartOfSpeech(new Set(sense.partOfSpeech)),
      miscTags: sense.misc.length > 0 ? sense.misc : null,
      fieldTags: sense.field.length > 0 ? sense.field : null,
      glosses,
      note: sense.info.length > 0 ? sense.info.join(' / ') : null,
    })
  })

  if (preparedSenses.length === 0) return null

  return {
    jmdictSeq: seq,
    lemma: forms.lemma,
    reading: forms.reading,
    pos: toPartOfSpeech(allTags),
    conjugationClass: toConjugationClass(allTags),
    senses: preparedSenses,
  }
}

/**
 * 표기와 읽기가 같은 엔트리들의 뜻을 한 단어로 합친다.
 *
 * 가타카나 외래어에서 주로 생긴다 — コート(외투/경기장), ライト(빛/오른쪽),
 * ロック(록/자물쇠)처럼 어원이 다른 단어가 같은 표기를 쓴다. JMdict는 이걸
 * 별도 엔트리로 두지만 우리는 (lemma, reading)이 유니크라 그냥 넣으면 뒤엣것이
 * 통째로 버려진다. 흔한 단어라 뜻 하나를 잃는 손해가 크므로 이어 붙인다.
 *
 * 품사와 활용은 첫 엔트리 것을 쓴다. 합쳐지는 쪽은 대개 같은 품사(명사)다.
 */
export function mergeHomographs(entries: PreparedEntry[]): {
  merged: PreparedEntry[]
  collisions: string[]
} {
  const byKey = new Map<string, PreparedEntry>()
  const collisions: string[] = []

  for (const entry of entries) {
    const key = `${entry.lemma}\t${entry.reading}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    const offset = existing.senses.length
    existing.senses.push(...entry.senses.map((s, i) => ({ ...s, orderNo: offset + i })))
    collisions.push(entry.lemma === entry.reading ? entry.lemma : `${entry.lemma}(${entry.reading})`)
  }

  return { merged: [...byKey.values()], collisions }
}

export function findDataFile(): string {
  const file = readdirSync(DATA_DIR).find(
    (f) => f.startsWith('jmdict-eng-common-') && f.endsWith('.json'),
  )
  if (!file) {
    throw new Error('data/ 에 JMdict JSON이 없습니다. 먼저 npm run data:fetch 를 실행하세요.')
  }
  return join(DATA_DIR, file)
}

const FREQ_SOURCE_URL = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz'
const FREQ_ARCHIVE_PATH = join(DATA_DIR, 'JMdict_e.gz')

/**
 * 빈도 순위용 원본 XML(gzip)을 준비한다. 이미 받아둔 게 있으면 그걸 쓴다.
 *
 * jmdict-simplified JSON에는 빈도 정보가 없다. 변환 과정에서 nf01~nf48 같은
 * 우선순위 태그를 common: boolean 하나로 축약하기 때문이다.
 * 순위를 얻으려면 EDRDG의 원본 XML을 따로 받아 ke_pri/re_pri 를 봐야 한다.
 */
export async function ensureFreqArchive(): Promise<Buffer> {
  mkdirSync(DATA_DIR, { recursive: true })

  if (existsSync(FREQ_ARCHIVE_PATH)) {
    console.log(`기존 파일 사용: ${FREQ_ARCHIVE_PATH}`)
    return readFileSync(FREQ_ARCHIVE_PATH)
  }

  console.log(`내려받는 중: ${FREQ_SOURCE_URL}`)
  const res = await fetch(FREQ_SOURCE_URL)
  if (!res.ok) throw new Error(`다운로드 실패: ${res.status} ${res.statusText}`)

  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(FREQ_ARCHIVE_PATH, buf)
  console.log(`  ${(buf.length / 1024 / 1024).toFixed(1)} MB 저장`)
  return buf
}

const ENT_SEQ_RE = /<ent_seq>(\d+)<\/ent_seq>/
const PRIORITY_RE = /<(?:ke|re)_pri>([^<]+)<\/(?:ke|re)_pri>/g

/**
 * 우선순위 태그만 뽑아 jmdict_seq → 빈도 순위 맵을 만든다.
 *
 * XML 전체를 파싱하지 않고 엔트리 단위로 잘라 정규식으로 훑는다. JMdict는 기계 생성
 * 파일이라 구조가 일정하고, 우리가 필요한 세 태그(ent_seq, ke_pri, re_pri)는
 * 엔티티 참조 없이 평문이라 이 방식으로 충분하다.
 */
export function parseFreqRanks(archive: Buffer): Map<number, number> {
  const xml = gunzipSync(archive).toString('utf8')
  const ranks = new Map<number, number>()

  for (const chunk of xml.split('</entry>')) {
    const seqMatch = ENT_SEQ_RE.exec(chunk)
    if (!seqMatch) continue

    const tags: string[] = []
    PRIORITY_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PRIORITY_RE.exec(chunk)) !== null) tags.push(m[1])
    if (tags.length === 0) continue

    const rank = toFreqRank(tags)
    if (rank !== null) ranks.set(Number(seqMatch[1]), rank)
  }

  return ranks
}
