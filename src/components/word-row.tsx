import { partOfSpeechLabels } from '@/db/labels'
import { freqLabel, type DictSense, type DictWord } from '@/lib/dictionary'

/**
 * 단어 한 줄. 메인(무작위 단어)과 전체 단어 목록이 함께 쓴다.
 *
 * @param order 전체 목록에서의 학습 순서. 순서가 의미 없는 화면(무작위 추출)에서는 넘기지 않는다.
 */
export function WordRow({ word, order }: { word: DictWord; order?: number }) {
  const freq = freqLabel(word.rank)

  return (
    <li className="flex gap-4 py-4">
      {order !== undefined && (
        <span className="w-12 shrink-0 pt-1.5 text-right font-mono text-xs text-zinc-400 tabular-nums">
          {order.toLocaleString()}
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
            {partOfSpeechLabels[word.pos]}
          </span>
          {freq && <span className="text-xs text-zinc-400">{freq}</span>}
        </div>
        <ol className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {word.senses.map((s, i) => (
            <li key={i} className="flex gap-2">
              {word.senses.length > 1 && (
                <span className="shrink-0 text-zinc-400 tabular-nums">{i + 1}.</span>
              )}
              <SenseText sense={s} />
            </li>
          ))}
        </ol>
      </div>
    </li>
  )
}

/** 한국어 뜻이 있으면 그걸 크게, 영어 원문은 대조용으로 작게 보여준다. 없으면 영어만. */
function SenseText({ sense }: { sense: DictSense }) {
  const { ko, en } = sense.meanings
  const posTag = sense.pos && (
    <span className="mr-1.5 text-xs text-zinc-500">[{partOfSpeechLabels[sense.pos]}]</span>
  )

  if (!ko) {
    return (
      <span>
        {posTag}
        {en?.glosses.join('; ')}
        {en?.note && <span className="ml-1.5 text-sm text-zinc-500">({en.note})</span>}
      </span>
    )
  }

  return (
    <span className="min-w-0">
      <span className="block">
        {posTag}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{ko.glosses.join(', ')}</span>
        {ko.note && <span className="ml-1.5 text-sm text-zinc-500">— {ko.note}</span>}
      </span>
      {en && <span className="block text-xs text-zinc-400">{en.glosses.join('; ')}</span>}
    </span>
  )
}

export function LoadingMessage() {
  return <p className="py-20 text-center text-zinc-500">사전 데이터를 불러오는 중…</p>
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  )
}
