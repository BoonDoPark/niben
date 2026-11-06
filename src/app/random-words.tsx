'use client'

import { useState } from 'react'

import { ErrorMessage, LoadingMessage, WordRow } from '@/components/word-row'
import { KOREAN_WORDS_PATH, type DictionaryFile, type DictWord } from '@/lib/dictionary'
import { useDictionary } from '@/lib/use-dictionary'

const SAMPLE_SIZE = 50

const MISSING_HINT =
  'public/data/words-ko.json 이 없습니다. 한국어 뜻을 만든 뒤 npm run data:export 를 실행하세요.'

/** 겹치지 않게 n개를 고른다. 앞에서부터 n자리만 섞는 피셔-예이츠. */
function sample<T>(items: readonly T[], n: number): T[] {
  const pool = items.slice()
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

type Loaded = { pool: DictWord[]; first: DictWord[] }

// 무작위 추출은 렌더 중에 하면 안 되므로(렌더마다 결과가 달라진다) 데이터를 받은 시점에 한다.
function prepare(data: DictionaryFile): Loaded {
  return { pool: data.words, first: sample(data.words, SAMPLE_SIZE) }
}

export default function RandomWords() {
  const loaded = useDictionary(KOREAN_WORDS_PATH, MISSING_HINT, prepare)
  // "다시 뽑기"를 누르기 전까지는 처음 뽑은 것을 보여준다.
  const [redrawn, setRedrawn] = useState<DictWord[] | null>(null)

  if (loaded.status === 'loading') return <LoadingMessage />
  if (loaded.status === 'error') return <ErrorMessage message={loaded.message} />

  const { pool, first } = loaded.value
  const picked = redrawn ?? first

  if (pool.length === 0) {
    return (
      <p className="py-16 text-center text-zinc-500">
        아직 한국어 뜻이 있는 단어가 없습니다. 전체 단어 탭에서 영어 뜻으로 볼 수 있습니다.
      </p>
    )
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          자주 쓰는 상위 단어 {pool.length.toLocaleString()}개 중 {picked.length}개를 무작위로
          골랐습니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setRedrawn(sample(pool, SAMPLE_SIZE))
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          다시 뽑기
        </button>
      </div>

      <ol className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {picked.map((w) => (
          <WordRow key={w.id} word={w} />
        ))}
      </ol>
    </section>
  )
}
