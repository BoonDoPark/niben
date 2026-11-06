import 'dotenv/config'

import { readFileSync } from 'node:fs'

import { db } from '../src/db'
import {
  senses,
  senseTranslations,
  words,
  type NewSense,
  type NewSenseTranslation,
  type NewWord,
} from '../src/db/schema'
import {
  findDataFile,
  mergeHomographs,
  prepare,
  type JmdictFile,
  type PreparedEntry,
} from './lib/jmdict-source'

/**
 * jmdict-simplified JSON을 DB에 넣는다.
 *
 * 한국어 뜻은 여기서 만들지 않는다. 이 스크립트는 영어 gloss까지만 채우고,
 * 번역은 별도 스크립트가 담당한다. 임포트는 결정적이라 몇 번이든 다시 돌릴 수 있지만
 * 번역은 비용이 들기 때문에, 섞어두면 임포트를 재실행할 때마다 번역비가 나간다.
 *
 * 재실행 시 이미 들어간 JMdict 엔트리는 건너뛴다. 손으로 고친 내용이 덮이지 않는다.
 */

const BATCH_SIZE = 1000

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function main() {
  const path = findDataFile()
  console.log(`읽는 중: ${path}`)
  const data = JSON.parse(readFileSync(path, 'utf8')) as JmdictFile
  console.log(`  JMdict ${data.version} / ${data.dictDate} / ${data.words.length}개 엔트리`)

  const converted = data.words.map(prepare).filter((e): e is PreparedEntry => e !== null)
  console.log(`  변환 성공 ${converted.length}개, 건너뜀 ${data.words.length - converted.length}개`)

  const { merged: prepared, collisions } = mergeHomographs(converted)
  if (collisions.length > 0) {
    console.log(`  동형이의어 ${collisions.length}개를 기존 표제어에 병합: ${collisions.join(', ')}`)
  }

  const existing = new Set(
    (await db.select({ jmdictSeq: words.jmdictSeq }).from(words))
      .map((r) => r.jmdictSeq)
      .filter((s): s is number => s !== null),
  )
  const pending = prepared.filter((e) => !existing.has(e.jmdictSeq))
  console.log(`  기존 ${existing.size}개, 신규 ${pending.length}개`)

  if (pending.length === 0) {
    console.log('\n넣을 것이 없습니다.')
    return
  }

  await db.transaction(async (tx) => {
    // 1) 표제어
    const wordRows: NewWord[] = pending.map((e) => ({
      lemma: e.lemma,
      reading: e.reading,
      pos: e.pos,
      conjugationClass: e.conjugationClass,
      jmdictSeq: e.jmdictSeq,
      source: 'jmdict' as const,
      verified: false,
    }))

    const seqToWordId = new Map<number, number>()
    for (const [i, batch] of chunk(wordRows, BATCH_SIZE).entries()) {
      // (lemma, reading)이 겹치는 엔트리는 건너뛴다. 뜻도 함께 빠진다.
      const inserted = await tx
        .insert(words)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: words.id, jmdictSeq: words.jmdictSeq })
      for (const row of inserted) {
        if (row.jmdictSeq !== null) seqToWordId.set(row.jmdictSeq, row.id)
      }
      process.stdout.write(`\r  표제어 ${(i + 1) * BATCH_SIZE > wordRows.length ? wordRows.length : (i + 1) * BATCH_SIZE}/${wordRows.length}`)
    }
    console.log(`\n  표제어 ${seqToWordId.size}개 삽입 (중복 ${wordRows.length - seqToWordId.size}개 건너뜀)`)

    // 2) 뜻
    const senseRows: NewSense[] = []
    const senseGlosses: Array<{ key: string; glosses: string[]; note: string | null }> = []

    for (const entry of pending) {
      const wordId = seqToWordId.get(entry.jmdictSeq)
      if (wordId === undefined) continue

      for (const s of entry.senses) {
        senseRows.push({
          wordId,
          orderNo: s.orderNo,
          // 단어 전체의 품사와 같으면 굳이 채우지 않는다. 이 컬럼은 예외용이다.
          pos: s.pos === entry.pos ? null : s.pos,
          miscTags: s.miscTags,
          fieldTags: s.fieldTags,
          source: 'jmdict' as const,
          verified: false,
        })
        senseGlosses.push({ key: `${wordId}:${s.orderNo}`, glosses: s.glosses, note: s.note })
      }
    }

    const senseKeyToId = new Map<string, number>()
    for (const [i, batch] of chunk(senseRows, BATCH_SIZE).entries()) {
      const inserted = await tx
        .insert(senses)
        .values(batch)
        .returning({ id: senses.id, wordId: senses.wordId, orderNo: senses.orderNo })
      for (const row of inserted) senseKeyToId.set(`${row.wordId}:${row.orderNo}`, row.id)
      process.stdout.write(`\r  뜻 ${(i + 1) * BATCH_SIZE > senseRows.length ? senseRows.length : (i + 1) * BATCH_SIZE}/${senseRows.length}`)
    }
    console.log(`\n  뜻 ${senseKeyToId.size}개 삽입`)

    // 3) 영어 gloss — 한국어 번역의 원본이자 검수 대조 기준이 된다.
    const translationRows: NewSenseTranslation[] = []
    for (const g of senseGlosses) {
      const senseId = senseKeyToId.get(g.key)
      if (senseId === undefined) continue
      translationRows.push({
        senseId,
        lang: 'en' as const,
        glosses: g.glosses,
        note: g.note,
        source: 'jmdict' as const,
        // JMdict 원문 그대로이므로 검수가 끝난 것으로 본다.
        verified: true,
      })
    }

    let translated = 0
    for (const [i, batch] of chunk(translationRows, BATCH_SIZE).entries()) {
      await tx.insert(senseTranslations).values(batch).onConflictDoNothing()
      translated += batch.length
      process.stdout.write(`\r  영어 뜻 ${translated}/${translationRows.length}`)
      void i
    }
    console.log(`\n  영어 뜻 ${translationRows.length}개 삽입`)
  })

  console.log('\n완료.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
