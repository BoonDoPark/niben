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
 * @param messages 화면 언어의 오류 문구. missing은 파일이 없을 때(404) 어떤 명령으로 만드는지 적은 안내,
 *   loadFailed는 그 밖의 실패("{status}"에 HTTP 상태가 들어간다).
 */
export function useDictionary<T>(
  path: string,
  messages: { missing: string; loadFailed: string },
  select: (data: DictionaryFile) => T,
): DictionaryState<T> {
  const { missing, loadFailed } = messages
  const [state, setState] = useState<DictionaryState<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(path, { signal: controller.signal })
      .then((res) => {
        if (res.status === 404) throw new Error(missing)
        if (!res.ok) throw new Error(loadFailed.replace('{status}', String(res.status)))
        return res.json() as Promise<DictionaryFile>
      })
      .then((data) => setState({ status: 'ready', value: select(data) }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => controller.abort()
  }, [path, missing, loadFailed, select])

  return state
}
