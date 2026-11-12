'use client'

import { useDeferredValue, useMemo, useState } from 'react'

import { WordBrowser } from '@/components/word-browser'
import { ErrorMessage, LoadingMessage, WordRow, type WordRowText } from '@/components/word-row'
import type { PartOfSpeech } from '@/db/schema'
import { format, numberLocale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries/ko'
import {
  DICTIONARY_PATH,
  hasKorean,
  normalizeForSearch,
  type DictionaryFile,
  type DictWord,
} from '@/lib/dictionary'
import { useDictionary } from '@/lib/use-dictionary'

const PAGE_SIZE = 50

/** 품사 필터. 화면용으로 18개 품사를 다섯 묶음으로 줄였다. 어디에도 안 걸리면 '기타'다. 이름은 화면 언어 사전에 있다. */
const POS_GROUPS = [
  { key: 'noun', pos: ['noun', 'pronoun'] },
  { key: 'verb', pos: ['verb_godan', 'verb_ichidan', 'verb_irregular'] },
  { key: 'adj', pos: ['adj_i', 'adj_na'] },
  { key: 'adverb', pos: ['adverb'] },
] as const satisfies ReadonlyArray<{ key: string; pos: readonly PartOfSpeech[] }>

type PosFilter = 'all' | 'other' | (typeof POS_GROUPS)[number]['key']

const GROUPED_POS = new Set<PartOfSpeech>(POS_GROUPS.flatMap((g) => g.pos))

function matchesPos(pos: PartOfSpeech, filter: PosFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'other') return !GROUPED_POS.has(pos)
  return POS_GROUPS.find((g) => g.key === filter)!.pos.some((p) => p === pos)
}

/** 학습 순서(전체 목록에서의 위치)와 정규화한 검색용 문자열을 미리 붙여 둔다. */
type IndexedWord = DictWord & {
  order: number
  lemmaKey: string
  readingKey: string
  /** 뜻을 한 줄에 하나씩 이어 붙인 것. 앞뒤에도 줄바꿈을 둬 완전 일치를 includes로 찾는다. */
  glossKey: string
}

function indexWord(word: DictWord, i: number): IndexedWord {
  return {
    ...word,
    order: i + 1,
    lemmaKey: normalizeForSearch(word.lemma),
    readingKey: normalizeForSearch(word.reading),
    glossKey: `\n${normalizeForSearch(
      word.senses
        .flatMap((s) => [...(s.meanings.ko?.glosses ?? []), ...(s.meanings.en?.glosses ?? [])])
        .join('\n'),
    )}\n`,
  }
}

function search(words: IndexedWord[], rawQuery: string, posFilter: PosFilter): IndexedWord[] {
  const byPos = words.filter((w) => matchesPos(w.pos, posFilter))
  const q = normalizeForSearch(rawQuery.trim())
  if (q === '') return byPos

  // 영어 뜻은 단어 첫머리부터 맞춘다. 그냥 포함 여부로 찾으면 eat가 treaty·great에 걸린다.
  // 한글은 앞 글자가 늘 [^a-z]라 사실상 부분 일치로 동작한다(먹 → 먹다, 잡아먹다).
  const glossPattern = new RegExp(`(^|[^a-z])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const hits = byPos.filter(
    (w) => w.lemmaKey.includes(q) || w.readingKey.includes(q) || glossPattern.test(w.glossKey),
  )

  // 표기·읽기가 똑같거나 뜻이 검색어 그대로("eat", "to eat")인 단어를 앞으로 올린다.
  // 나머지는 학습 순서를 지킨다.
  const isExact = (w: IndexedWord) =>
    w.lemmaKey === q ||
    w.readingKey === q ||
    w.glossKey.includes(`\n${q}\n`) ||
    w.glossKey.includes(`\nto ${q}\n`)
  return [...hits.filter(isExact), ...hits.filter((w) => !isExact(w))]
}

export type WordListText = {
  row: WordRowText
  words: Dictionary['words']
  loading: string
  errors: { missing: string; loadFailed: string }
}

type Loaded = { data: DictionaryFile; words: IndexedWord[]; koWords: number }

function prepare(data: DictionaryFile): Loaded {
  return { data, words: data.words.map(indexWord), koWords: data.words.filter(hasKorean).length }
}

export default function WordList({ text }: { text: WordListText }) {
  const loaded = useDictionary(DICTIONARY_PATH, text.errors, prepare)
  const [query, setQuery] = useState('')
  const [posFilter, setPosFilter] = useState<PosFilter>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)

  // 2만 개를 매 타자마다 거르면 입력이 버벅일 수 있어 검색어 반영을 뒤로 미룬다.
  const deferredQuery = useDeferredValue(query)

  const results = useMemo(
    () => (loaded.status === 'ready' ? search(loaded.value.words, deferredQuery, posFilter) : []),
    [loaded, deferredQuery, posFilter],
  )

  if (loaded.status === 'loading') return <LoadingMessage text={text.loading} />
  if (loaded.status === 'error') return <ErrorMessage message={loaded.message} />

  const state = loaded.value
  const t = text.words
  const locale = numberLocale(text.row.locale)
  const num = (n: number) => n.toLocaleString(locale)
  // 한국어 화면에서만 번역 범위를 알린다. 영어 뜻은 모든 단어에 있다.
  const showsKorean = text.row.meaningLanguages[0] === 'ko'

  const filters: Array<{ key: PosFilter; label: string }> = [
    { key: 'all', label: t.filters.all },
    ...POS_GROUPS.map((g) => ({ key: g.key, label: t.filters[g.key] })),
    { key: 'other', label: t.filters.other },
  ]

  return (
    <WordBrowser words={state.data.words} text={text.row}>
      <section>
        {showsKorean && state.koWords < state.words.length && (
          <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {state.koWords === 0 ? t.noKorean : format(t.partialKorean, { n: num(state.koWords) })}
          </p>
        )}

        <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <label htmlFor="word-search" className="sr-only">
            {t.searchLabel}
          </label>
          <input
            id="word-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setVisible(PAGE_SIZE)
            }}
            placeholder={t.searchPlaceholder}
            autoComplete="off"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={posFilter === f.key}
                onClick={() => {
                  setPosFilter(f.key)
                  setVisible(PAGE_SIZE)
                }}
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:aria-pressed:border-zinc-100 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 mb-2 text-sm text-zinc-500">
          {format(t.count, { n: num(results.length) })}
          {results.length !== state.words.length && format(t.ofTotal, { total: num(state.words.length) })}
        </p>

        {results.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">{t.notFound}</p>
        ) : (
          <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {results.slice(0, visible).map((w) => (
              <WordRow key={w.id} word={w} order={w.order} text={text.row} />
            ))}
          </ol>
        )}

        {visible < results.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="mt-6 w-full rounded-xl border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {format(t.more, { shown: num(Math.min(visible, results.length)), total: num(results.length) })}
          </button>
        )}

        <p className="mt-6 text-xs text-zinc-400">{state.data.source}</p>
      </section>
    </WordBrowser>
  )
}
