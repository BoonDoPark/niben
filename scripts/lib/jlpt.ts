import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { JlptLevel } from '../../src/db/schema'
import { DATA_DIR, findDataFile, type JmdictFile } from './jmdict-source'

/**
 * JLPT 레벨(N5~N1) 붙이기.
 *
 * 출처: OpenJLPT(https://github.com/evanclan/OpenJLPT, CC BY-SA 4.0). 레벨 분류는 Jonathan Waller의
 * 커뮤니티 목록(tanos.co.uk, CC BY)에서 온 것이라 공식이 아니다 — JLPT는 2010년 이후 어휘 목록을 내지 않는다.
 * 우리 단어의 뜻·품사는 그대로 JMdict를 쓰고, 여기서는 레벨만 가져온다.
 *
 * 매칭: OpenJLPT 단어는 jmdict_id를 갖고 있다. 우리 단어는 표제어+읽기 단위로 병합돼 있어
 * (JMdict 엔트리 번호가 DB 밖으로 나가지 않는다) JMdict 파일에서 (표기, 읽기) → 엔트리 번호를 만들어 이어 붙인다.
 */

const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']
const BASE_URL = 'https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab'
const OPENJLPT_DIR = join(DATA_DIR, 'openjlpt')

type OpenJlptWord = { word: string; reading: string; level: JlptLevel; jmdict_id: number | null }

/** 레벨별 JSON이 없으면 내려받는다. 합쳐서 7MB 정도다. */
async function ensureOpenJlpt(): Promise<OpenJlptWord[]> {
  mkdirSync(OPENJLPT_DIR, { recursive: true })
  const all: OpenJlptWord[] = []
  for (const level of LEVELS) {
    const path = join(OPENJLPT_DIR, `${level.toLowerCase()}.json`)
    if (!existsSync(path)) {
      const url = `${BASE_URL}/${level.toLowerCase()}.json`
      console.log(`OpenJLPT 내려받는 중: ${url}`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`OpenJLPT ${level} 를 내려받지 못했습니다 (HTTP ${res.status})`)
      writeFileSync(path, await res.text())
    }
    all.push(...(JSON.parse(readFileSync(path, 'utf8')) as OpenJlptWord[]))
  }
  return all
}

export type JlptLookup = {
  /** 표제어+읽기로 레벨을 찾는다. 목록에 없으면 null. */
  find(lemma: string, reading: string): JlptLevel | null
  /** OpenJLPT 단어 수 */
  total: number
  /** 그중 우리 JMdict 파일에 있는 수(우리 단어와 이어질 수 있는 상한) */
  linkable: number
}

/** 레벨 조회기를 만든다. 첫 호출에 OpenJLPT 파일을 내려받는다. */
export async function loadJlptLookup(): Promise<JlptLookup> {
  const openJlpt = await ensureOpenJlpt()
  const levelById = new Map<string, JlptLevel>()
  for (const w of openJlpt) {
    if (w.jmdict_id === null) continue
    const id = String(w.jmdict_id)
    const prev = levelById.get(id)
    // 같은 엔트리가 여러 레벨에 있으면 쉬운 쪽을 쓴다(LEVELS 는 쉬운 순).
    if (!prev || LEVELS.indexOf(w.level) < LEVELS.indexOf(prev)) levelById.set(id, w.level)
  }

  const jmdict = JSON.parse(readFileSync(findDataFile(), 'utf8')) as JmdictFile
  const byForm = new Map<string, JlptLevel>()
  let linkable = 0
  for (const e of jmdict.words) {
    const level = levelById.get(e.id)
    if (!level) continue
    linkable++
    // 한자 표기가 있어도 가나로만 적는 단어(これ ← 此れ)가 있어서 가나 표기 키도 함께 둔다.
    const kanji = [...e.kanji.map((k) => k.text), null]
    for (const k of kanji) {
      for (const r of e.kana) {
        const key = `${k ?? r.text}\t${r.text}`
        const prev = byForm.get(key)
        if (!prev || LEVELS.indexOf(level) < LEVELS.indexOf(prev)) byForm.set(key, level)
      }
    }
  }

  return {
    find: (lemma, reading) => byForm.get(`${lemma}\t${reading}`) ?? null,
    total: openJlpt.length,
    linkable,
  }
}

export function countByLevel(levels: Iterable<JlptLevel | null | undefined>): Record<JlptLevel | 'none', number> {
  const count = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0, none: 0 }
  for (const l of levels) count[l ?? 'none']++
  return count
}
