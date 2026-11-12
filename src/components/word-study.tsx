'use client'

import { useId, useState, type FormEvent } from 'react'

import type { WordRowText } from '@/components/word-row'
import type { Language } from '@/db/schema'
import { format } from '@/i18n/config'
import type { DictExample, DictMeaning, DictWord } from '@/lib/dictionary'
import type { CheckRequest, CheckResult } from '@/lib/grading'
import { useExamples } from '@/lib/use-examples'

/**
 * 단어 상세 화면(WordBrowser)의 학습 패널.
 * - 예문: 일본어 원문·가나 읽기, 누르면 화면 언어 번역. 예문마다 해석을 써서 채점받는다(translate).
 * - 작문: 이 단어를 넣어 직접 쓴 일본어 문장을 채점받는다(compose).
 * 채점은 /api/check(Gemini)가 하고, 피드백은 화면 언어로 온다.
 */

type StudyText = WordRowText['study']
type WordInfo = CheckRequest['word']

/** 화면 언어 우선순위에서 처음 있는 언어와 값. */
function pick<T>(values: Partial<Record<Language, T>>, langs: readonly Language[]): [Language, T] | null {
  for (const lang of langs) {
    const value = values[lang]
    if (value !== undefined) return [lang, value]
  }
  return null
}

export function WordStudy({ word, text, id }: { word: DictWord; text: WordRowText; id?: string }) {
  const t = text.study
  const state = useExamples(word.id)
  // 채점할 때 함께 보내는 단어 뜻(화면 언어). 뜻이 아주 많은 단어(する 등)는 앞쪽만 보낸다.
  const wordInfo: WordInfo = {
    lemma: word.lemma,
    reading: word.reading,
    meanings: word.senses
      .map((s) => pick<DictMeaning>(s.meanings, text.meaningLanguages)?.[1].glosses.join(', '))
      .filter((m): m is string => Boolean(m))
      .slice(0, 8),
  }

  return (
    <div
      id={id}
      className="mt-3 space-y-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
    >
      <section>
        <h3 className="text-sm font-semibold text-zinc-500">{t.examples}</h3>
        {state.status === 'loading' && <p className="mt-2 text-sm text-zinc-500">{t.loadingExamples}</p>}
        {state.status === 'error' && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{t.examplesFailed}</p>}
        {state.status === 'ready' && state.examples.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">{t.noExamples}</p>
        )}
        {state.status === 'ready' && state.examples.length > 0 && (
          <ul className="mt-3 space-y-6">
            {state.examples.map((e, i) => (
              <ExampleItem
                key={i}
                example={e}
                showSense={word.senses.length > 1}
                text={text}
                wordInfo={wordInfo}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-zinc-500">{t.composeTitle}</h3>
        <GradeForm
          label={format(t.composeLabel, { word: word.lemma })}
          placeholder={t.composePlaceholder}
          answerLang="ja"
          suggestionLabel={t.suggestion}
          suggestionLang="ja"
          feedbackLang={text.meaningLanguages[0]}
          text={t}
          build={(answer) => ({ mode: 'compose', locale: text.locale, word: wordInfo, answer })}
        />
      </section>

      <p className="text-xs text-zinc-400">{t.poweredBy}</p>
    </div>
  )
}

function ExampleItem({
  example,
  showSense,
  text,
  wordInfo,
}: {
  example: DictExample
  showSense: boolean
  text: WordRowText
  wordInfo: WordInfo
}) {
  const t = text.study
  const [shown, setShown] = useState(false)
  const translation = pick(example.translations, text.meaningLanguages)
  const translationId = useId()

  return (
    <li>
      {showSense && (
        <p className="mb-1 text-xs text-zinc-400">{format(t.senseLabel, { n: example.sense + 1 })}</p>
      )}
      <p lang="ja" className="text-lg leading-relaxed text-zinc-900 dark:text-zinc-100">
        {example.ja}
      </p>
      {example.reading && example.reading !== example.ja && (
        <p lang="ja" className="text-sm text-zinc-500">
          {example.reading}
        </p>
      )}
      {translation && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-expanded={shown}
            aria-controls={translationId}
            className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            {shown ? t.hideMeaning : t.showMeaning}
          </button>
          {shown && (
            <p id={translationId} lang={translation[0]} className="mt-1 text-zinc-700 dark:text-zinc-300">
              {translation[1]}
            </p>
          )}
        </div>
      )}
      <GradeForm
        label={t.translateLabel}
        placeholder={t.translatePlaceholder}
        answerLang={text.meaningLanguages[0]}
        suggestionLabel={t.betterTranslation}
        suggestionLang={text.meaningLanguages[0]}
        feedbackLang={text.meaningLanguages[0]}
        text={t}
        // 채점을 받으면 모범 번역도 함께 보여준다. 고친 번역이 모범 번역과 같으면 두 번 보여주지 않는다.
        onGraded={() => setShown(true)}
        alreadyShown={translation?.[1]}
        build={(answer) => ({
          mode: 'translate',
          locale: text.locale,
          word: wordInfo,
          example: { ja: example.ja, reference: translation?.[1] ?? '' },
          answer,
        })}
      />
    </li>
  )
}

type GradeState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: CheckResult }
  | { status: 'error'; message: string }

const KNOWN_ERRORS = ['rate_limited', 'quota', 'not_configured', 'failed'] as const

function GradeForm({
  label,
  placeholder,
  answerLang,
  suggestionLabel,
  suggestionLang,
  feedbackLang,
  text,
  build,
  onGraded,
  alreadyShown,
}: {
  label: string
  placeholder: string
  answerLang: Language
  suggestionLabel: string
  suggestionLang: Language
  feedbackLang: Language
  text: StudyText
  build: (answer: string) => CheckRequest
  onGraded?: () => void
  /** 화면에 이미 보이는 문장. suggestion 이 이것과 같으면 다시 보여주지 않는다. */
  alreadyShown?: string
}) {
  const inputId = useId()
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState<GradeState>({ status: 'idle' })
  const checking = state.status === 'checking'

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = answer.trim()
    if (!value || checking) return
    setState({ status: 'checking' })
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(build(value)),
      })
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const code = (data as { error?: string } | null)?.error
        const known = KNOWN_ERRORS.find((k) => k === code) ?? 'failed'
        setState({ status: 'error', message: text.errors[known] })
        return
      }
      setState({ status: 'done', result: data as CheckResult })
      onGraded?.()
    } catch {
      setState({ status: 'error', message: text.errors.failed })
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <label htmlFor={inputId} className="text-sm text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={inputId}
          lang={answerLang}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={300}
          placeholder={placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[15px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={!answer.trim() || checking}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {checking ? text.checking : text.check}
        </button>
      </div>
      <div aria-live="polite">
        {state.status === 'error' && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">{state.message}</p>
        )}
        {state.status === 'done' && (
          <div
            className={`mt-2 rounded-lg border px-3 py-2.5 text-sm ${
              state.result.correct
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/50'
            }`}
          >
            <p
              className={`font-semibold ${
                state.result.correct ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
              }`}
            >
              {state.result.correct ? `✓ ${text.correct}` : `△ ${text.incorrect}`}
            </p>
            <p lang={feedbackLang} className="mt-1 text-zinc-700 dark:text-zinc-300">
              {state.result.feedback}
            </p>
            {state.result.suggestion && state.result.suggestion.trim() !== alreadyShown?.trim() && (
              <p className="mt-1.5 text-zinc-700 dark:text-zinc-300">
                <span className="text-zinc-500">{suggestionLabel}: </span>
                <span lang={suggestionLang}>{state.result.suggestion}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
