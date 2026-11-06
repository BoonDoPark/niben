import type { ConjugationClass, PartOfSpeech } from './schema'

/**
 * JMdict 태그 → 우리 스키마 매핑.
 *
 * 순수 함수만 둔다. 임포트 스크립트가 이걸 쓰고, 매핑이 틀렸을 때
 * 고칠 곳이 여기 한 군데가 되도록 분리했다.
 *
 * 태그 정의: https://www.edrdg.org/jmdict/jmdict_dtd_h.html
 */

/**
 * 표제어로 쓰면 안 되는 표기/읽기 태그.
 * sK/sk는 검색 전용, rK/rk는 거의 안 쓰는 형태, oK/ok는 구자체, iK/ik는 비표준 표기다.
 * 학습자에게 이런 형태를 대표형으로 보여주면 안 된다.
 */
export const EXCLUDED_FORM_TAGS = new Set(['sK', 'sk', 'rK', 'rk', 'oK', 'ok', 'iK', 'ik'])

/**
 * 품사 매핑. 배열 순서가 우선순위다.
 *
 * 명사류를 마지막에 두는 게 핵심이다. JMdict는 명사에 adj-no(の가 붙는 명사),
 * adj-f(연체 수식) 같은 태그를 함께 붙이는데, 이걸 형용사로 오인하면 안 된다.
 * 그런 태그는 아예 매핑하지 않아 명사로 떨어지게 했다.
 *
 * vs(する가 붙는 명사)도 여기 없다. 勉強는 품사가 명사이고, する가 붙는다는 사실은
 * 활용 클래스(suru_noun)가 표현한다.
 */
const POS_RULES: ReadonlyArray<readonly [string, PartOfSpeech]> = [
  // 활용하는 진짜 동사
  ['v1', 'verb_ichidan'],
  ['v1-s', 'verb_ichidan'],
  ['vz', 'verb_ichidan'],
  ['v5b', 'verb_godan'],
  ['v5g', 'verb_godan'],
  ['v5k', 'verb_godan'],
  ['v5k-s', 'verb_godan'],
  ['v5m', 'verb_godan'],
  ['v5n', 'verb_godan'],
  ['v5r', 'verb_godan'],
  ['v5r-i', 'verb_godan'],
  ['v5s', 'verb_godan'],
  ['v5t', 'verb_godan'],
  ['v5u', 'verb_godan'],
  ['v5u-s', 'verb_godan'],
  ['v5aru', 'verb_godan'],
  ['vr', 'verb_godan'],
  ['vn', 'verb_godan'],
  ['vk', 'verb_irregular'],
  ['vs-i', 'verb_irregular'],
  ['vs-s', 'verb_irregular'],
  ['vs-c', 'verb_irregular'],
  // 형용사
  ['adj-i', 'adj_i'],
  ['adj-ix', 'adj_i'],
  ['adj-na', 'adj_na'],
  ['adj-nari', 'adj_na'],
  ['adj-t', 'adj_na'],
  ['adj-pn', 'adnominal'],
  // 그 밖의 품사 — 명사보다 구체적인 것들
  ['pn', 'pronoun'],
  ['conj', 'conjunction'],
  ['prt', 'particle'],
  ['aux', 'auxiliary'],
  ['aux-v', 'auxiliary'],
  ['aux-adj', 'auxiliary'],
  ['cop', 'auxiliary'],
  ['int', 'interjection'],
  ['pref', 'prefix'],
  ['suf', 'suffix'],
  ['ctr', 'counter'],
  ['exp', 'expression'],
  // 명사류
  ['n', 'noun'],
  ['n-t', 'noun'],
  ['n-adv', 'noun'],
  ['n-pr', 'noun'],
  ['n-pref', 'noun'],
  ['n-suf', 'noun'],
  ['num', 'noun'],
  /*
   * 부사는 명사 뒤에 둔다.
   *
   * JMdict는 시간·수량 명사에 n과 adv를 함께 붙인다(水曜日, 夕方, 一回, 直後 …).
   * 실제로 「明日行く」처럼 부사로 쓰이기 때문인데, 이 조합이 496개나 되고
   * 그 대부분이 학습자에게는 명사로 보여야 하는 단어다.
   * 순수 부사(ゆっくり, はっきり)는 n 태그가 없으므로 여기서 제대로 잡힌다.
   *
   * 대신 段々, ひらひら 같은 의태어 일부가 명사로 분류된다. 소수라 감수한다.
   */
  ['adv', 'adverb'],
  ['adv-to', 'adverb'],
]

/**
 * 활용 클래스 매핑. 배열 순서가 우선순위다.
 *
 * vs를 마지막에 두는 게 중요하다. 察する는 vs-s(suru_special)이고
 * 勉強는 n + vs(suru_noun)인데, vs를 앞에 두면 전자가 잘못 잡힌다.
 */
const CONJUGATION_RULES: ReadonlyArray<readonly [string, ConjugationClass]> = [
  ['v1-s', 'ichidan_kureru'],
  ['v1', 'ichidan'],
  ['vz', 'ichidan'],
  ['v5k-s', 'godan_iku'],
  ['v5r-i', 'godan_aru'],
  ['v5u-s', 'godan_uru'],
  ['v5aru', 'godan_honorific'],
  ['v5b', 'godan'],
  ['v5g', 'godan'],
  ['v5k', 'godan'],
  ['v5m', 'godan'],
  ['v5n', 'godan'],
  ['v5r', 'godan'],
  ['v5s', 'godan'],
  ['v5t', 'godan'],
  ['v5u', 'godan'],
  ['vk', 'kuru'],
  ['vs-i', 'suru'],
  ['vs-s', 'suru_special'],
  ['vs-c', 'suru_special'],
  ['adj-ix', 'adj_i_ii'],
  ['adj-i', 'adj_i'],
  ['adj-na', 'adj_na'],
  ['adj-nari', 'adj_na'],
  ['vs', 'suru_noun'],
]

function firstMatch<T>(
  tags: ReadonlySet<string>,
  rules: ReadonlyArray<readonly [string, T]>,
): T | null {
  for (const [tag, value] of rules) {
    if (tags.has(tag)) return value
  }
  return null
}

export function toPartOfSpeech(tags: ReadonlySet<string>): PartOfSpeech {
  return firstMatch(tags, POS_RULES) ?? 'other'
}

export function toConjugationClass(tags: ReadonlySet<string>): ConjugationClass | null {
  return firstMatch(tags, CONJUGATION_RULES)
}

/**
 * 빈도 순위 환산.
 *
 * JMdict 원본 XML의 ke_pri/re_pri 태그에서 온다. jmdict-simplified는 이 태그를
 * common: boolean 하나로 축약해버리므로 순위를 얻으려면 원본 XML을 봐야 한다.
 *
 * nfXX가 실제 순위다 — 마이니치신문 코퍼스 빈도를 500단어 단위로 끊은 구간으로,
 * nf01이 상위 500개다. 구간의 시작값을 순위로 쓴다(nf01 → 1, nf48 → 23501).
 *
 * nf가 없는 단어는 나머지 태그로 추정한다. 이때 태그를 뭉뚱그리면 안 된다.
 * 출처가 다르고 성격도 다르기 때문이다. 실제 분포(nf 동반 여부)는 이렇다.
 *
 *   news1  nf없음     1 / nf있음 11666   신문 코퍼스. 사실상 항상 nf가 따라온다
 *   ichi1  nf없음  2407 / nf있음  7145   기본어휘 1만어 목록
 *   spec1  nf없음  1643 / nf있음   311   편집자가 빈출로 판단
 *   gai1   nf없음  4007 / nf있음     2   흔한 외래어
 *
 * 이걸 한 버킷으로 합치면 人·行く(ichi1)가 アンモニア·ヘルニア(gai1)와 같은 값을 받고,
 * 둘 다 曖昧(nf35) 같은 희귀어보다 뒤로 밀린다. 학습 순서로 쓸 수 없게 된다.
 *
 * ichi1의 값을 10000으로 두는 데는 근거가 있다. 이 태그는 "기본어휘 1만어에 들어간다"는
 * 뜻이므로 순위가 10000 이하라는 주장과 같다. 그 주장의 가장 보수적인 끝값을 쓰면
 * nf01~nf20(순위 10000 이하가 확정된 구간) 뒤, nf21 이후 앞에 놓여 모순이 없다.
 * spec1과 gai1은 수치 주장이 없어 경험적으로 정한 자리표시자다.
 */
const FREQ_BUCKETS: ReadonlyArray<readonly [string, number]> = [
  ['ichi1', 10000], // 기본어휘 1만어 수록 = 순위 10000 이하라는 주장
  ['spec1', 20000], // 편집자 판단 빈출
  ['gai1', 25000], // 흔한 외래어
  ['news1', 25000], // nf 없이 news1만 있는 경우는 사실상 없다
  ['ichi2', 35000],
  ['spec2', 35000],
  ['gai2', 35000],
  ['news2', 35000],
]

export const FREQ_RANK_MIN_BUCKET = 10000

export function toFreqRank(priorityTags: Iterable<string>): number | null {
  const tags = new Set(priorityTags)

  let band: number | null = null
  for (const tag of tags) {
    if (!tag.startsWith('nf')) continue
    const n = Number(tag.slice(2))
    if (Number.isFinite(n) && (band === null || n < band)) band = n
  }
  if (band !== null) return (band - 1) * 500 + 1

  // 여러 목록에 걸쳐 있으면 가장 흔하다고 보는 쪽을 택한다.
  let bucket: number | null = null
  for (const [tag, value] of FREQ_BUCKETS) {
    if (tags.has(tag) && (bucket === null || value < bucket)) bucket = value
  }
  return bucket
}
