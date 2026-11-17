'use client'

import { useCallback, useState } from 'react'

import { WordBrowser } from '@/components/word-browser'
import { ErrorMessage, LoadingMessage, WordRow, type WordRowText } from '@/components/word-row'
import { format, numberLocale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries/ko'
import { hasMeaningIn, STUDY_WORDS_PATH, type DictionaryFile, type DictWord } from '@/lib/dictionary'
import { useDictionary } from '@/lib/use-dictionary'

const SAMPLE_SIZE = 50

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

export type RandomWordsText = {
  row: WordRowText
  random: Dictionary['random']
  loading: string
  errors: { missing: string; loadFailed: string }
}

export default function RandomWords({ text }: { text: RandomWordsText }) {
  // 화면 언어의 주 뜻(한국어 화면이면 한국어)이 있는 단어에서만 뽑는다.
  const primaryLang = text.row.meaningLanguages[0]

  // 무작위 추출은 렌더 중에 하면 안 되므로(렌더마다 결과가 달라진다) 데이터를 받은 시점에 한다.
  const prepare = useCallback(
    (data: DictionaryFile): Loaded => {
      const pool = data.words.filter((w) => hasMeaningIn(w, primaryLang))
      return { pool, first: sample(pool, SAMPLE_SIZE) }
    },
    [primaryLang],
  )
  const loaded = useDictionary(STUDY_WORDS_PATH, text.errors, prepare)
  // "다시 뽑기"를 누르기 전까지는 처음 뽑은 것을 보여준다.
  const [redrawn, setRedrawn] = useState<DictWord[] | null>(null)

  if (loaded.status === 'loading') return <LoadingMessage text={text.loading} />
  if (loaded.status === 'error') return <ErrorMessage message={loaded.message} />

  const { pool, first } = loaded.value
  const picked = redrawn ?? first
  const locale = numberLocale(text.row.locale)

  if (pool.length === 0) {
    return <p className="py-16 text-center text-zinc-500">{text.random.empty}</p>
  }

  return (
    <WordBrowser words={pool} text={text.row}>
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            {format(text.random.summary, {
              total: pool.length.toLocaleString(locale),
              count: picked.length.toLocaleString(locale),
            })}
          </p>
          <button
            type="button"
            onClick={() => {
              setRedrawn(sample(pool, SAMPLE_SIZE))
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {text.random.redraw}
          </button>
        </div>

        <ol className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
          {picked.map((w) => (
            <WordRow key={w.id} word={w} text={text.row} />
          ))}
        </ol>
      </section>
    </WordBrowser>
  )
}
