import type { Language, PartOfSpeech } from '@/db/schema'

/**
 * 앱이 받는 정적 사전 데이터의 형태.
 *
 * 추출 스크립트가 이 형태로 public/data/words.json 을 쓰고, 브라우저가 그 파일을 받아 쓴다.
 * 쓰는 쪽은 둘이다 — DB에서 뽑는 data:export(한국어 뜻 포함)와
 * DB 없이 로컬 JMdict에서 뽑는 data:local(영어 뜻만). 화면은 이 타입만 본다.
 */
export type DictionaryFile = {
  source: string
  generatedAt: string
  words: DictWord[]
}

export type DictWord = {
  /** 표제어 ID. 화면에서는 React key로만 쓴다. */
  id: number
  lemma: string
  reading: string
  pos: PartOfSpeech
  /** 실사용 빈도 순위(words.usage_rank). scripts/lib/usage-rank.ts 참고. 없으면 null. */
  rank: number | null
  senses: DictSense[]
}

export type DictSense = {
  /** 단어 전체 품사와 다를 때만 있다. */
  pos?: PartOfSpeech
  /**
   * 언어별 뜻. en(JMdict 원문)은 늘 있고 ko는 생성된 것만 있다.
   * 한국어 뜻이 있어도 영어를 함께 싣는 이유는 검수할 때 원문과 대조하기 위해서다.
   */
  meanings: Partial<Record<Language, DictMeaning>>
}

export type DictMeaning = {
  glosses: string[]
  note?: string
}

export const DICTIONARY_PATH = '/data/words.json'

/**
 * 메인 화면의 무작위 단어를 뽑는 범위. 학습 순서 상위 STUDY_RANGE 단어 중 한국어 뜻이 있는 것만 담는다.
 * 전체 파일(수 MB)을 받지 않고 몇십 단어를 보여주기 위해 data:export 가 따로 쓴다.
 *
 * 범위를 두는 이유: 예전 순서(신문 빈도)로 번역해 둔 명사가 상위 밖에 1,500개쯤 남아 있어서,
 * 번역된 단어 전부에서 뽑으면 다시 명사 위주가 된다.
 */
export const KOREAN_WORDS_PATH = '/data/words-ko.json'
export const STUDY_RANGE = 2000

export function hasKorean(word: DictWord): boolean {
  return word.senses.some((s) => s.meanings.ko)
}

const FREQ_LABEL_LIMITS = [500, 1000, 3000, 5000, 10000, 20000] as const

/**
 * 실사용 빈도 순위를 사람이 읽을 말로 바꾼다.
 *
 * 순위는 빈도 목록의 표기 단위 순위라(조사·인명 등 사전에 없는 것도 끼어 있다)
 * 정확한 숫자보다 구간으로 보여준다. 2만 위 밖은 표시하지 않는다.
 */
export function freqLabel(rank: number | null): string | null {
  if (rank === null) return null
  const limit = FREQ_LABEL_LIMITS.find((l) => rank <= l)
  return limit ? `빈도 ${limit.toLocaleString()}위 안` : null
}

/**
 * 검색용 정규화. 가타카나를 히라가나로 바꾸고 영문을 소문자로 만든다.
 * 「てれび」로 「テレビ」를 찾을 수 있게 하기 위해서다.
 */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}
