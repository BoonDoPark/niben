'use client'

import { useDeferredValue, useMemo, useState } from 'react'

import { LevelFilter, type LevelChoice } from '@/components/level-filter'
import { ErrorMessage, LoadingMessage } from '@/components/word-row'
import { format, numberLocale, type Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries/ko'
import { normalizeForSearch } from '@/lib/dictionary'
import { KANJI_PATH, type KanjiEntry, type KanjiFile } from '@/lib/study-data'
import { useStaticFile } from '@/lib/use-dictionary'

const PAGE_SIZE = 60

export type KanjiListText = {
  locale: Locale
  kanji: Dictionary['kanji']
  loading: string
  errors: { missing: string; loadFailed: string }
}

type Indexed = KanjiEntry & { key: string }

function prepare(file: KanjiFile) {
  const kanji: Indexed[] = file.kanji.map((k) => ({
    ...k,
    // 한자·읽기(가타카나는 히라가나로)·영어 뜻을 한 줄로 이어 검색에 쓴다.
    key: normalizeForSearch([k.c, ...k.on, ...k.kun, ...k.meanings].join('\n')),
  }))
  const counts = { N5: 0, N4: 0, N3: 0, N2: 0, N1: 0 }
  for (const k of kanji) counts[k.level]++
  return { source: file.source, kanji, counts }
}

export default function KanjiList({ text }: { text: KanjiListText }) {
  const loaded = useStaticFile(KANJI_PATH, text.errors, prepare)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<LevelChoice>('all')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const deferred = useDeferredValue(query)

  const results = useMemo(() => {
    if (loaded.status !== 'ready') return []
    // 읽기 앞의 "-"(접미 훈독 표기)는 검색에 방해가 되어 뗀다.
    const q = normalizeForSearch(deferred.trim()).replace(/^-/, '')
    return loaded.value.kanji.filter((k) => (level === 'all' || k.level === level) && (q === '' || k.key.includes(q)))
  }, [loaded, deferred, level])

  if (loaded.status === 'loading') return <LoadingMessage text={text.loading} />
  if (loaded.status === 'error') return <ErrorMessage message={loaded.message} />

  const t = text.kanji
  const nl = numberLocale(text.locale)
  const total = loaded.value.kanji.length

  return (
    <section>
      <p className="mb-4 text-xs text-zinc-400">{t.note}</p>
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <label htmlFor="kanji-search" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="kanji-search"
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
          {results.slice(0, visible).map((k) => (
            <KanjiRow key={k.c} kanji={k} text={t} />
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

function KanjiRow({ kanji: k, text }: { kanji: KanjiEntry; text: Dictionary['kanji'] }) {
  return (
    <li className="flex gap-4 py-4">
      <span lang="ja" className="w-16 shrink-0 text-center text-5xl leading-none font-semibold">
        {k.c}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {k.level}
          </span>
          <span className="text-xs text-zinc-400">{format(text.strokes, { n: k.strokes })}</span>
          <span className="text-xs text-zinc-400">
            {text.radical} <span lang="ja">{k.radical}</span>
          </span>
        </div>
        <p className="font-medium text-zinc-900 dark:text-zinc-100" lang="en">
          {k.meanings.join(', ')}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm" lang="ja">
          {k.on.length > 0 && (
            <>
              <dt className="text-zinc-500" lang="">
                {text.on}
              </dt>
              <dd>{k.on.join('、')}</dd>
            </>
          )}
          {k.kun.length > 0 && (
            <>
              <dt className="text-zinc-500" lang="">
                {text.kun}
              </dt>
              <dd>{k.kun.join('、')}</dd>
            </>
          )}
        </dl>
        {k.words.length > 0 && (
          <p className="text-sm text-zinc-500" lang="ja">
            {k.words.join('　')}
          </p>
        )}
      </div>
    </li>
  )
}
