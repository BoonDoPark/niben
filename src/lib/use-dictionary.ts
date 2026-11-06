import { useEffect, useState } from 'react'

import type { DictionaryFile } from './dictionary'

export type DictionaryState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T }

/**
 * public/data 아래 정적 사전 파일을 받아 select로 가공한 값을 돌려준다.
 *
 * 가공(색인 만들기, 무작위 추출)을 렌더 중이 아니라 응답을 받은 시점에 한 번만 하려고 select를 받는다.
 * select는 매 렌더 새로 만들어지면 다시 받아 오므로 모듈 최상단 함수를 넘겨야 한다.
 *
 * @param missingHint 파일이 없을 때(404) 보여줄 안내. 어떤 명령으로 만드는지 적는다.
 */
export function useDictionary<T>(
  path: string,
  missingHint: string,
  select: (data: DictionaryFile) => T,
): DictionaryState<T> {
  const [state, setState] = useState<DictionaryState<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(path, { signal: controller.signal })
      .then((res) => {
        if (res.status === 404) throw new Error(missingHint)
        if (!res.ok) throw new Error(`사전 데이터를 불러오지 못했습니다 (${res.status})`)
        return res.json() as Promise<DictionaryFile>
      })
      .then((data) => setState({ status: 'ready', value: select(data) }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => controller.abort()
  }, [path, missingHint, select])

  return state
}
