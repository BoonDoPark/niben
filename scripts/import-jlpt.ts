import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DictionaryFile } from '../src/lib/dictionary'
import { countByLevel, loadJlptLookup } from './lib/jlpt'

/**
 * 이미 만들어 둔 public/data/words.json·study.json 에 JLPT 레벨(jlpt)만 덧붙인다.
 *
 * data:export 는 DB가, data:local 은 JMdict 전체 처리가 필요하다. 번역을 다시 뽑지 않고
 * 레벨만 갱신하려고 따로 둔 지름길이다. 두 export 스크립트도 같은 lookup 을 써서 같은 결과가 나온다.
 * 몇 번을 돌려도 같은 결과다(기존 jlpt 값은 덮어쓴다).
 */

const DIR = join(process.cwd(), 'public', 'data')

async function main() {
  const jlpt = await loadJlptLookup()
  console.log(`OpenJLPT ${jlpt.total}단어 (우리 JMdict 안에 ${jlpt.linkable}개)`)

  for (const name of ['words.json', 'study.json']) {
    const path = join(DIR, name)
    const file = JSON.parse(readFileSync(path, 'utf8')) as DictionaryFile
    file.words = file.words.map((w) => {
      const level = jlpt.find(w.lemma, w.reading)
      const next = { ...w }
      if (level) next.jlpt = level
      else delete next.jlpt
      return next
    })
    writeFileSync(path, JSON.stringify(file))
    const c = countByLevel(file.words.map((w) => w.jlpt))
    console.log(`${name}: ${file.words.length}개 단어`, c)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
