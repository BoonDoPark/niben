import type { PartOfSpeech } from '../../src/db/schema'

/**
 * 앱용 JSON(words.json, study.json)에 실을 뜻을 고르는 규칙. DB 데이터는 건드리지 않는다.
 *
 * 한 글자 히라가나 표제어(の, は, を, に …)의 뜻 중 한국어로 조사·어미에 해당하는 것
 * (~의, ~은/는, ~이/가, ~(으)로 …)은 단어장에서 따로 익힐 단어가 아니라서 뺀다(사용자 결정, 2026-11-07).
 * 같은 표제어라도 단어로서의 뜻(ね = 저기, え = 어?, で = 그래서)은 남긴다.
 * 남는 뜻이 없으면 단어 전체가 빠진다(の, は, を …).
 * のに, には처럼 다른 글자와 이어진 표제어는 건드리지 않는다.
 *
 * 조사·어미 뜻을 가리는 기준: 한국어 뜻에 "~"가 있다(번역 규칙상 붙여 쓰는 말은 "~"로 적는다).
 * 한국어 뜻이 없으면 품사로 판단한다 — 조사·조동사·접속사·접두사·접미사면 뺀다.
 */

const ATTACHED_POS = new Set<PartOfSpeech>(['particle', 'auxiliary', 'conjunction', 'prefix', 'suffix'])

export function isSingleKana(lemma: string): boolean {
  return /^[ぁ-ゖ]$/.test(lemma)
}

export type SenseForFilter = {
  /** 뜻 자체의 품사. 단어 품사와 같으면 null일 수 있다. */
  pos: PartOfSpeech | null | undefined
  koGlosses: string[] | undefined
}

/** 뜻 하나를 앱에 실을지. 한 글자 히라가나 표제어가 아니면 늘 true. */
export function keepSense(lemma: string, wordPos: PartOfSpeech, sense: SenseForFilter): boolean {
  if (!isSingleKana(lemma)) return true
  if (sense.koGlosses && sense.koGlosses.length > 0) {
    return !sense.koGlosses.some((g) => g.includes('~'))
  }
  return !ATTACHED_POS.has(sense.pos ?? wordPos)
}

/**
 * 뜻을 거른 뒤 단어 품사를 다시 정한다.
 * よ(조사)에서 감탄사 "야"만 남으면 단어 품사도 감탄사로 보여야 맞다.
 * 남은 뜻 중에 단어 품사와 같은 것이 있으면 그대로 둔다.
 */
export function resolveWordPos(wordPos: PartOfSpeech, keptSensePos: PartOfSpeech[]): PartOfSpeech {
  if (keptSensePos.length === 0 || keptSensePos.includes(wordPos)) return wordPos
  return keptSensePos[0]
}
