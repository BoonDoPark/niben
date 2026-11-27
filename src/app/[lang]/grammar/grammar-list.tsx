'use client'

import { useDeferredValue, useMemo, useState } from 'react'

import { Furigana } from '@/components/furigana'
import { LevelFilter, type LevelChoice } from '@/components/level-filter'
import { ErrorMessage, LoadingMessage } from '@/components/word-row'
import { format, numberLocale, type Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries/ko'
import { normalizeForSearch } from '@/lib/dictionary'
import { GRAMMAR_PATH, type GrammarEntry, type GrammarFile } from '@/lib/study-data'
import { useStaticFile } from '@/lib/use-dictionary'

const PAGE_SIZE = 40

export type GrammarListText = {
  locale: Locale
  grammar: Dictionary['grammar']
  loading: string
  errors: { missing: string; loadFailed: string }
}

type Indexed = GrammarEntry & { key: string }

function prepare(file: GrammarFile) {
  const grammar: Indexed[] = file.grammar.map((g) => ({
    ...g,
    key: normalizeForSearch([g.pattern, g.romaji, g.meaning].join('\n')),
  }))
  const counts = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 }
  for (const g of grammar) counts[g.level]++
  return { source: file.source, grammar, counts }
}

export default function GrammarList({ text }: { text: GrammarListText }) {
  const loaded = useStaticFile(GRAMMAR_PATH, text.errors, prepare)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelChoice>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    if (loaded.status !== 'ready') return []
    // 〜 는 표기만 다를 뿐 뜻이 없어 검색어에서 뗀다("てもらう"로도 "〜てもらう"를 찾도록).
    const q = normalizeForSearch(deferred.trim()).replace(/[〜～~]/g, '')
    return loaded.value.grammar.filter(
      (g) => (level === 'all' || g.level === level) && (q === '' || g.key.replace(/[〜～~]/g, '').includes(q)),
    )
  }, [loaded, deferred, level])

  if (loaded.status === 'loading') return <LoadingMessage text={text.loading} />
  if (loaded.status === 'error') return <ErrorMessage message={loaded.message} />

  const t = text.grammar
  const nl = numberLocale(text.locale)
  const total = loaded.value.grammar.length

  return (
    <section>
      <p className="mb-4 text-xs text-zinc-400">{t.note}</p>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label htmlFor="grammar-search" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="grammar-search"
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
        <div className="mt-3">
          <LevelFilter
            value={level}
            onChange={(l) => {
              setLevel(l)
              setVisible(PAGE_SIZE)
            }}
            counts={loaded.value.counts}
            total={total}
            label={t.level}
            allLabel={t.all}
            numberLocale={nl}
          />
        </div>
      </div>

      <p className="mt-4 mb-2 text-sm text-zinc-500">
        {format(t.count, { n: results.length.toLocaleString(nl) })}
        {results.length !== total && format(t.ofTotal, { total: total.toLocaleString(nl) })}
      </p>

      {results.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">{t.notFound}</p>
      ) : (
        <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {results.slice(0, visible).map((g) => (
            <GrammarRow key={g.id} grammar={g} text={t} />
          ))}
        </ol>
      )}

      {visible < results.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mt-6 w-full rounded-xl border border-zinc-300 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {format(t.more, {
            shown: Math.min(visible, results.length).toLocaleString(nl),
            total: results.length.toLocaleString(nl),
          })}
        </button>
      )}
      <p className="mt-6 text-xs text-zinc-400">{loaded.value.source}</p>
    </section>
  )
}

/** 문법 하나. 눌러서 접속·예문·참고를 펼친다(기본은 접힘 — 526개를 한눈에 훑기 위해). */
function GrammarRow({ grammar: g, text }: { grammar: GrammarEntry; text: Dictionary['grammar'] }) {
  return (
    <li>
      <details className="group py-3">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">
          <span lang="ja" className="text-xl font-semibold">
            {g.pattern}
          </span>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {g.level}
          </span>
          <span className="w-full text-[15px] text-zinc-700 dark:text-zinc-300" lang="en">
            {g.meaning}
          </span>
        </summary>
        <div className="mt-3 space-y-4 px-2">
          <p className="text-sm">
            <span className="text-zinc-500">{text.formation}</span>{' '}
            <span lang="ja" className="font-medium">
              {g.formation}
            </span>
          </p>
          {g.notes && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400" lang="en">
              {g.notes}
            </p>
          )}
          <ol className="space-y-3">
            {g.examples.map((e, i) => (
              <li key={i} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
                <p className="text-lg leading-loose">
                  <Furigana text={e.furigana ?? e.ja} />
                </p>
                <p className="text-sm text-zinc-500" lang="en">
                  {e.en}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </li>
  )
}
