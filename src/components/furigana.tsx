import { parseFurigana } from '@/lib/study-data'

/** "{先輩|せんぱい}に…" 꼴의 후리가나 표기를 <ruby> 로 그린다. */
export function Furigana({ text }: { text: string }) {
  return (
    <span lang="ja">
      {parseFurigana(text).map((p, i) =>
        p.ruby ? (
          <ruby key={i}>
            {p.base}
            <rt className="text-[0.55em] text-zinc-500">{p.ruby}</rt>
          </ruby>
        ) : (
          <span key={i}>{p.base}</span>
        ),
      )}
    </span>
  )
}
