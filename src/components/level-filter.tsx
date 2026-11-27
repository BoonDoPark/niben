'use client'

import { jlptLevelOrder } from '@/db/labels'
import type { JlptLevel } from '@/db/schema'

export type LevelChoice = 'all' | JlptLevel

const CHIP =
  'rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 aria-pressed:border-zinc-900 aria-pressed:bg-zinc-900 aria-pressed:text-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:aria-pressed:border-zinc-100 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900'

/** JLPT 레벨 선택 칩(전체 / N5 … N1). 칩마다 개수를 보인다. 한자·문법 목록이 함께 쓴다. */
export function LevelFilter({
  value,
  onChange,
  counts,
  total,
  label,
  allLabel,
  numberLocale,
}: {
  value: LevelChoice
  onChange: (next: LevelChoice) => void
  counts: Record<JlptLevel, number>
  total: number
  label: string
  allLabel: string
  numberLocale: string
}) {
  const num = (n: number) => n.toLocaleString(numberLocale)
  const choices: Array<{ key: LevelChoice; label: string; count: number }> = [
    { key: 'all', label: allLabel, count: total },
    ...jlptLevelOrder.map((l) => ({ key: l, label: l, count: counts[l] })),
  ]
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-zinc-500">{label}</span>
      {choices.map((c) => (
        <button key={c.key} type="button" aria-pressed={value === c.key} onClick={() => onChange(c.key)} className={CHIP}>
          {c.label}
          <span className="ml-1.5 text-xs opacity-60 tabular-nums">{num(c.count)}</span>
        </button>
      ))}
    </div>
  )
}
