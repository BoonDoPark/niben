import 'dotenv/config'

import { sql } from 'drizzle-orm'

import { db } from '../src/db'
import { learningOrder } from '../src/db/order'
import { words } from '../src/db/schema'
import { assignUsageRanks, ensureUsageFreqCsv, parseUsageFreqCsv, type RankTarget } from './lib/usage-rank'

/**
 * jiten.moe 실사용 빈도 목록으로 words.usage_rank 를 채운다. 학습 순서의 1차 기준이 된다.
 *
 * data:import 를 먼저 돌린 뒤 실행한다. 몇 번을 돌려도 결과가 같다(목록에 없는 단어는 null로 되돌린다).
 * 순서가 바뀌면 상위 단어 중 한국어 뜻이 없는 것이 생기므로 translate → data:export 를 이어서 돌린다.
 *
 * 라이선스: jiten.moe 빈도 목록은 CC BY-SA 4.0.
 */

const BATCH_SIZE = 5000

async function main() {
  console.log('빈도 목록 읽는 중...')
  const freq = parseUsageFreqCsv(await ensureUsageFreqCsv())
  console.log(`  (표기, 읽기) ${freq.size}개`)

  // 첫 뜻의 uk 태그만 본다. 뜻마다 다를 수 있지만 대표 표기를 정하는 건 대표 뜻이다.
  const rows = await db.execute<{ id: number; lemma: string; reading: string; uk: boolean }>(sql`
    SELECT w.id, w.lemma, w.reading,
           coalesce((SELECT 'uk' = ANY(s.misc_tags) FROM senses s
                     WHERE s.word_id = w.id ORDER BY s.order_no LIMIT 1), false) AS uk
    FROM ${words} w
  `)
  const targets: RankTarget[] = rows.map((r) => ({
    id: r.id,
    lemma: r.lemma,
    reading: r.reading,
    usuallyKana: r.uk,
  }))

  const ranks = assignUsageRanks(targets, freq)
  console.log(`  순위를 찾은 단어 ${ranks.size}개 / ${targets.length}개`)

  await db.execute(sql`UPDATE ${words} SET usage_rank = NULL WHERE usage_rank IS NOT NULL`)

  const entries = [...ranks.entries()]
  let updated = 0
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
    // import-frequency.ts 와 같은 이유로 unnest + sql.param 을 쓴다.
    const result = await db.execute(sql`
      UPDATE ${words} SET usage_rank = v.rank
      FROM (
        SELECT unnest(${sql.param(batch.map(([id]) => id))}::int[]) AS id,
               unnest(${sql.param(batch.map(([, rank]) => rank))}::int[]) AS rank
      ) AS v
      WHERE ${words.id} = v.id
    `)
    updated += result.count ?? 0
  }
  console.log(`  갱신 ${updated}개`)

  // 새 학습 순서로 상위 2,000단어의 품사 분포를 보여준다. 순위가 상식에 맞는지 눈으로 확인하는 용도다.
  const top = await db
    .select({ lemma: words.lemma, pos: words.pos })
    .from(words)
    .orderBy(...learningOrder)
    .limit(2000)
  const byPos = new Map<string, number>()
  for (const w of top) byPos.set(w.pos, (byPos.get(w.pos) ?? 0) + 1)
  console.log('\n상위 2,000단어 품사:')
  console.log(
    '  ' +
      [...byPos.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([pos, n]) => `${pos} ${n}`)
        .join(' · '),
  )
  console.log(`  처음 30개: ${top.slice(0, 30).map((w) => w.lemma).join(' ')}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
