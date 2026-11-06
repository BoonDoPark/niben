import 'dotenv/config'

import { sql } from 'drizzle-orm'

import { db } from '../src/db'
import { FREQ_RANK_MIN_BUCKET } from '../src/db/jmdict'
import { words } from '../src/db/schema'
import { ensureFreqArchive, parseFreqRanks } from './lib/jmdict-source'

/**
 * JMdict 원본 XML에서 빈도 순위를 읽어 words.freq_rank 를 채운다.
 *
 * 왜 별도 스크립트인가: 임포트가 쓰는 jmdict-simplified JSON에는 빈도 정보가 없다.
 * 변환 과정에서 nf01~nf48 같은 우선순위 태그를 common: boolean 하나로 축약하기 때문이다.
 * 순위를 얻으려면 EDRDG의 원본 XML을 따로 받아 ke_pri/re_pri 를 봐야 한다.
 *
 * data:import 를 먼저 돌린 뒤 실행한다. jmdict_seq 로 기존 표제어를 찾아 갱신한다.
 *
 * 라이선스: JMdict는 CC BY-SA 4.0 (EDRDG).
 */

const BATCH_SIZE = 5000

async function main() {
  const archive = await ensureFreqArchive()

  console.log('빈도 태그 파싱 중...')
  const ranks = parseFreqRanks(archive)
  console.log(`  우선순위 보유 엔트리 ${ranks.size}개`)

  const entries = [...ranks.entries()]
  let updated = 0

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    const seqs = batch.map(([seq]) => seq)
    const values = batch.map(([, rank]) => rank)

    // unnest 로 두 배열을 한 번에 넘긴다. 행마다 파라미터를 만들면
    // 파라미터 개수 상한에 걸리고 쿼리도 커진다.
    //
    // sql.param 이 필요하다. 배열을 그냥 넣으면 드리즐이 파라미터 목록으로 펼쳐
    // (v1, v2, ...) 형태의 행 표현식이 되고, 컬럼 수 상한(1664)에 걸린다.
    const result = await db.execute(sql`
      UPDATE ${words} SET freq_rank = v.rank
      FROM (
        SELECT unnest(${sql.param(seqs)}::int[]) AS seq,
               unnest(${sql.param(values)}::int[]) AS rank
      ) AS v
      WHERE ${words.jmdictSeq} = v.seq
    `)
    updated += result.count ?? 0
    process.stdout.write(`\r  갱신 ${updated}개`)
  }

  console.log()

  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ranked: sql<number>`count(*) FILTER (WHERE ${words.freqRank} IS NOT NULL)::int`,
      precise: sql<number>`count(*) FILTER (WHERE ${words.freqRank} % 500 = 1
        AND ${words.freqRank} <= 23501)::int`,
      top2000: sql<number>`count(*) FILTER (WHERE ${words.freqRank} <= 2000)::int`,
    })
    .from(words)

  console.log(`\n표제어 ${stats.total}개 중`)
  console.log(`  순위 있음        ${stats.ranked}`)
  console.log(`    nf 정밀 순위   ${stats.precise}`)
  console.log(`    버킷 추정      ${stats.ranked - stats.precise} (${FREQ_RANK_MIN_BUCKET} 이상)`)
  console.log(`  순위 없음        ${stats.total - stats.ranked}`)
  console.log(`\n  상위 2000위 이내: ${stats.top2000}개`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
