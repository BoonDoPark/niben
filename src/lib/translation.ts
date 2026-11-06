import { z } from 'zod'

import { conjugationClassLabels, partOfSpeechLabels } from '../db/labels'
import type { ConjugationClass, PartOfSpeech } from '../db/schema'

/**
 * 한국어 뜻 생성용 프롬프트와 스키마.
 *
 * 번역 품질이 이 프로젝트의 전부이므로 프롬프트를 스크립트에서 분리해 둔다.
 * 여기를 고치고 --dry-run 으로 확인한 뒤 실제 실행하는 흐름을 의도했다.
 *
 * 이번 버전은 한국어만 다룬다. 스키마(sense_translations)는 다국어를 감당하지만
 * 실제로 필요해지기 전까지 코드를 언어별로 추상화하지 않는다.
 */

export const TRANSLATION_MODEL = 'gemini-3.8-flash'

export const TranslationBatchSchema = z.object({
  translations: z.array(
    z.object({
      senseId: z.number(),
      /** 대표성 순으로 1~3개. */
      glosses: z.array(z.string()),
      /** 뉘앙스 설명. 대부분 null. */
      note: z.string().nullable(),
    }),
  ),
})

export type TranslationBatch = z.infer<typeof TranslationBatchSchema>

/**
 * Gemini 응답 형식 지정(responseJsonSchema)용 JSON Schema.
 * $schema 키는 Gemini가 받는 JSON Schema 부분집합에 없어서 뺀다.
 */
const translationJsonSchema: Record<string, unknown> = { ...z.toJSONSchema(TranslationBatchSchema) }
delete translationJsonSchema.$schema
export const TRANSLATION_JSON_SCHEMA = translationJsonSchema

export const SYSTEM_PROMPT = `당신은 일본어-한국어 사전을 만드는 편집자다. 일본어 표제어와 그 영어 뜻풀이를 받아 한국어 뜻을 작성한다.

## 가장 중요한 원칙

영어를 한국어로 번역하지 마라. 영어 뜻풀이는 "이 표제어의 여러 의미 중 어느 쪽인가"를 알려주는 참고 자료일 뿐이다. 한국어 뜻은 일본어 원어에서 직접 뽑는다.

일본어와 한국어는 한자어를 공유하므로 직결 대응이 되는 경우가 많다. 영어를 거치면 이 대응이 끊어진다.

  微妙 (びみょう) — 영어: delicate; subtle; difficult
    ✗ 섬세한, 미묘한, 어려운    ← 영어를 옮긴 결과
    ○ 미묘하다                 ← 한자어 직결 대응

  我慢 (がまん) — 영어: patience; endurance; self-control
    ✗ 인내, 참을성, 자제력
    ○ 참음, 견딤               ← 이 단어가 실제로 쓰이는 방식

한자 표기가 없는 고유어(ありがとう, もったいない 등)는 직결 대응이 없으므로
영어와 일본어를 함께 보고 실제 쓰임에 맞는 한국어를 고른다.

## 작성 규칙

1. 품사에 맞는 형태로 쓴다.
   - 동사 → 기본형 (먹다, 가다)
   - い형용사·な형용사 → 기본형 (크다, 조용하다)
   - 명사 → 명사형 (책, 시간)
   - する가 붙는 명사(する동사) → 명사형으로 쓴다. "공부"(○) / "공부하다"(✗)
   - 부사 → 부사형 (천천히, 확실히)

2. glosses는 대표성 순으로 1~3개. 억지로 채우지 않는다. 하나로 충분하면 하나만 쓴다.

3. 사전에만 있는 딱딱한 말 대신 실제로 쓰는 말을 고른다.

4. 태그를 반영한다.
   - 용법 uk = 보통 가나로 표기하는 단어. 한자 표기의 뜻에 끌리지 마라.
   - 용법 arch(고어)·obs(폐어) = 현대 한국어에 대응이 없을 수 있다. 가장 가까운 말을 쓰고 note에 밝힌다.
   - 용법 col(구어)·sl(속어)·vulg(비속어) = 격에 맞는 한국어를 고른다.
   - 분야 태그(comp, med, bot 등) = 그 분야에서 실제로 쓰는 한국어 용어를 쓴다.

5. note는 뉘앙스 설명이 꼭 필요할 때만 쓴다. 대부분은 null이다.
   필요한 경우 — 한국어에 대응어가 없을 때, 비슷한 단어와 구분이 필요할 때, 사용 맥락에 제약이 있을 때.
   예) あげる → "(내가 남에게) 주다" / くれる → "(남이 나에게) 주다"

6. 같은 표제어의 여러 뜻은 서로 구별되게 쓴다. 뜻 1과 뜻 2가 같은 한국어가 되면 안 된다.

7. 확신이 없으면 그럴듯한 말을 지어내지 말고, 가장 가까운 대응어를 쓴 뒤 note에 불확실한 지점을 적는다.

## 출력

입력에 있는 모든 sense를 senseId 그대로 돌려준다. 하나도 빠뜨리지 마라.`

export type SenseInput = {
  senseId: number
  orderNo: number
  pos: PartOfSpeech | null
  miscTags: string[] | null
  fieldTags: string[] | null
  enGlosses: string[]
  enNote: string | null
}

export type WordInput = {
  lemma: string
  reading: string
  pos: PartOfSpeech
  conjugationClass: ConjugationClass | null
  senses: SenseInput[]
}

/**
 * 표제어 단위로 묶어서 보낸다.
 *
 * 뜻을 하나씩 따로 보내면 모델이 "이 표제어의 다른 뜻과 겹치지 않게 쓰라"는 판단을 할 수 없다.
 * 生 처럼 뜻이 여러 개인 단어에서 이 차이가 크다.
 */
export function formatWord(word: WordInput): string {
  const posLabel = partOfSpeechLabels[word.pos]
  const conjLabel = word.conjugationClass
    ? conjugationClassLabels[word.conjugationClass]
    : null
  // 품사와 활용 표시가 겹치면 한 번만 쓴다 (명사 + する동사 같은 조합만 둘 다 남는다).
  const head =
    conjLabel && conjLabel !== posLabel ? `${posLabel} · ${conjLabel}` : posLabel

  const title =
    word.lemma === word.reading
      ? `### ${word.lemma} · ${head}`
      : `### ${word.lemma} (${word.reading}) · ${head}`

  const lines = word.senses.map((s) => {
    const parts = [`[${s.senseId}] ${s.enGlosses.join(' / ')}`]
    if (s.pos && s.pos !== word.pos) parts.push(`품사:${partOfSpeechLabels[s.pos]}`)
    if (s.miscTags?.length) parts.push(`용법:${s.miscTags.join(',')}`)
    if (s.fieldTags?.length) parts.push(`분야:${s.fieldTags.join(',')}`)
    if (s.enNote) parts.push(`비고:${s.enNote}`)
    return parts.join(' · ')
  })

  return [title, ...lines].join('\n')
}

export function buildUserMessage(words: WordInput[]): string {
  const total = words.reduce((n, w) => n + w.senses.length, 0)
  return [
    `아래 ${words.length}개 표제어, ${total}개 뜻에 대해 한국어 뜻을 작성하라.`,
    '',
    words.map(formatWord).join('\n\n'),
  ].join('\n')
}
