import { asc, sql } from 'drizzle-orm'

import { words } from './schema'

/**
 * 학습 순서. 번역 대상 고르기(translate)와 앱용 JSON 추출(data:export)이 같은 순서를 써야
 * "상위 N단어"가 어디서나 같은 단어를 가리킨다.
 *
 * 1. 실사용 빈도(usage_rank) — 1차 기준
 * 2. 신문 빈도(freq_rank) — 실사용 목록에 없는 단어끼리
 * 3. jmdict_seq, id — 동률 고정
 */
export const learningOrder = [
  sql`${words.usageRank} ASC NULLS LAST`,
  sql`${words.freqRank} ASC NULLS LAST`,
  asc(words.jmdictSeq),
  asc(words.id),
] as const
