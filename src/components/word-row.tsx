import type { Language, PartOfSpeech } from '@/db/schema'
import type { DictSense, DictWord } from '@/lib/dictionary'
import { freqLabel } from '@/lib/dictionary'
import type { Locale } from '@/i18n/config'

/** 단어 한 줄을 그리는 데 필요한 화면 언어 정보. 페이지가 사전에서 뽑아 넘긴다. */
export type WordRowText = {
  locale: Locale
  /** 뜻 언어 우선순위. 뜻마다 앞에서부터 있는 언어 하나만 보여준다. i18n/config.ts 의 MEANING_LANGUAGES. */
  meaningLanguages: readonly Language[]
  pos: Record<PartOfSpeech, string>
  /** "빈도 {n}위 안" */
  freq: string
}

/**
 * 단어 한 줄. 메인(무작위 단어)과 전체 단어 목록이 함께 쓴다.
 *
 * @param order 전체 목록에서의 학습 순서. 순서가 의미 없는 화면(무작위 추출)에서는 넘기지 않는다.
 */
export function WordRow({ word, order, text }: { word: DictWord; order?: number; text: WordRowText }) {
  const freq = freqLabel(word.rank, text.freq, text.locale)

  return (
    <li className="flex gap-4 py-4">
      {order !== undefined && (
        <span className="w-12 shrink-0 pt-1.5 text-right font-mono text-xs text-zinc-400 tabular-nums">
          {order.toLocaleString(text.locale)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span lang="ja" className="text-2xl font-semibold">
            {word.lemma}
          </span>
          {word.reading !== word.lemma && (
            <span lang="ja" className="text-zinc-500">
              {word.reading}
            </span>
          )}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {text.pos[word.pos]}
          </span>
          {freq && <span className="text-xs text-zinc-400">{freq}</span>}
        </div>
        <ol className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {word.senses.map((s, i) => (
            <li key={i} className="flex gap-2">
              {word.senses.length > 1 && (
                <span className="shrink-0 text-zinc-400 tabular-nums">{i + 1}.</span>
              )}
              <SenseText sense={s} text={text} />
            </li>
          ))}
        </ol>
      </div>
    </li>
  )
}

/**
 * 뜻 하나. 화면의 뜻 언어 하나로만 보여준다(한국어 화면이면 한국어만).
 * 그 언어로 된 뜻이 없으면(한국어 미번역) 다음 언어로 대신 보여주되 강조하지 않는다.
 */
function SenseText({ sense, text }: { sense: DictSense; text: WordRowText }) {
  // 화면의 뜻 언어가 하나도 없는 경우(예: 영어 화면인데 영어 뜻이 없음)는 사실상 없지만, 비우지 않는다.
  const lang =
    text.meaningLanguages.find((l) => sense.meanings[l]) ??
    (Object.keys(sense.meanings) as Language[])[0]
  const meaning = lang ? sense.meanings[lang] : undefined
  if (!lang || !meaning) return null

  const isFallback = lang !== text.meaningLanguages[0]

  return (
    <span className="min-w-0" lang={lang}>
      {sense.pos && <span className="mr-1.5 text-xs text-zinc-500">[{text.pos[sense.pos]}]</span>}
      <span className={isFallback ? undefined : 'font-medium text-zinc-900 dark:text-zinc-100'}>
        {meaning.glosses.join(glossSeparator(lang))}
      </span>
      {meaning.note && <span className="ml-1.5 text-sm text-zinc-500">— {meaning.note}</span>}
    </span>
  )
}

/** 영어 뜻풀이는 안에 쉼표가 들어가는 일이 많아(to eat, to have) 세미콜론으로 나눈다. */
function glossSeparator(lang: Language): string {
  return lang === 'en' ? '; ' : ', '
}

export function LoadingMessage({ text }: { text: string }) {
  return <p className="py-20 text-center text-zinc-500">{text}</p>
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  )
}
