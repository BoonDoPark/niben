'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'

import { OpenWordContext, SenseList, WORD_PARAM, WordHeading, type WordRowText } from '@/components/word-row'
import { WordStudy } from '@/components/word-study'
import type { DictWord } from '@/lib/dictionary'

/**
 * 단어 목록과 단어 상세(예문·연습)를 같은 주소에서 오간다.
 *
 * 단어를 누르면 주소에 ?w=단어ID 를 더하고(history.pushState) 목록 대신 상세를 보여준다.
 * 목록은 지우지 않고 숨겨 둔다. 그래서 뒤로 돌아오면 검색어·필터·"더 보기" 개수·무작위로 뽑은 단어가 그대로이고,
 * 들어가기 전 스크롤 위치로 되돌린다. 브라우저 뒤로가기와 화면의 뒤로가기 버튼이 같게 동작한다.
 * 상세 주소로 바로 들어와도(새 탭, 공유한 링크) 그 단어를 보여준다.
 *
 * useSearchParams 를 쓰므로 정적 페이지에서는 Suspense 안에 두어야 한다(페이지가 감싼다).
 */
export function WordBrowser({
  words,
  text,
  children,
}: {
  /** 상세로 열 수 있는 단어(그 화면이 불러온 단어 전부) */
  words: readonly DictWord[]
  text: WordRowText
  /** 목록 화면 */
  children: ReactNode
}) {
  const searchParams = useSearchParams()
  const raw = searchParams.get(WORD_PARAM)
  const selectedId = raw && /^\d+$/.test(raw) ? Number(raw) : null
  const showing = selectedId !== null

  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words])
  const selected = selectedId === null ? null : (byId.get(selectedId) ?? null)

  /** 상세로 들어가기 직전 목록의 스크롤 위치 */
  const listScroll = useRef(0)
  /** 이 화면에서 단어를 눌러 들어왔는지. 아니면(주소로 바로 들어옴) 뒤로가기가 사이트 밖으로 나가지 않게 한다. */
  const openedFromList = useRef(false)
  const wasShowing = useRef(showing)

  const open = useCallback((word: DictWord) => {
    listScroll.current = window.scrollY
    openedFromList.current = true
    const params = new URLSearchParams(window.location.search)
    params.set(WORD_PARAM, String(word.id))
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [])

  const back = useCallback(() => {
    if (openedFromList.current) {
      window.history.back()
      return
    }
    const params = new URLSearchParams(window.location.search)
    params.delete(WORD_PARAM)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [])

  // 상세로 들어가면 맨 위에서 시작하고, 목록으로 돌아오면 들어가기 전 위치로 되돌린다.
  // 목록이 다시 보인 뒤(레이아웃이 잡힌 뒤)에 옮겨야 하므로 useLayoutEffect 에서 한다.
  useLayoutEffect(() => {
    if (showing) window.scrollTo(0, 0)
    else if (wasShowing.current) window.scrollTo(0, listScroll.current)
    wasShowing.current = showing
  }, [showing, selectedId])

  return (
    <OpenWordContext value={open}>
      <div hidden={showing}>{children}</div>
      {showing && <WordDetail word={selected} text={text} onBack={back} />}
    </OpenWordContext>
  )
}

function WordDetail({ word, text, onBack }: { word: DictWord | null; text: WordRowText; onBack: () => void }) {
  const t = text.study
  return (
    <article>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <span aria-hidden="true">←</span> {t.back}
      </button>

      {word ? (
        <div className="mt-4">
          <WordHeading word={word} text={text} size="lg" />
          <SenseList word={word} text={text} />
          <WordStudy word={word} text={text} />
        </div>
      ) : (
        <p className="py-16 text-center text-zinc-500">{t.notFound}</p>
      )}
    </article>
  )
}
