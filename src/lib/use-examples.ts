import { useEffect, useState } from 'react'

import { EXAMPLES_PATH, type DictExample, type ExamplesFile } from './dictionary'

export type ExamplesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; examples: DictExample[] }

/**
 * 예문 파일은 한 번만 받아 모든 단어가 나눠 쓴다. 파일이 없으면(data:local 로 만든 데이터) 예문 없음으로 본다.
 * 실패하면 다음에 단어를 펼칠 때 다시 받는다.
 */
let pending: Promise<ExamplesFile | null> | null = null

function loadExamples(): Promise<ExamplesFile | null> {
  pending ??= fetch(EXAMPLES_PATH)
    .then((res) => {
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ExamplesFile>
    })
    .catch((err: unknown) => {
      pending = null
      throw err
    })
  return pending
}

/** 단어 하나의 예문. 단어를 펼쳤을 때만 부른다. */
export function useExamples(wordId: number): ExamplesState {
  const [state, setState] = useState<ExamplesState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadExamples()
      .then((file) => {
        if (!cancelled) setState({ status: 'ready', examples: file?.words[wordId] ?? [] })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [wordId])

  return state
}
