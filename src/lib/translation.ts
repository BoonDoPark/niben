import { z } from 'zod'

import { conjugationClassLabels, partOfSpeechLabels } from '../db/labels'
import type { ConjugationClass, Language, PartOfSpeech } from '../db/schema'

/**
 * 생성 뜻(한국어·스페인어)용 프롬프트와 스키마.
 *
 * 번역 품질이 이 프로젝트의 전부이므로 프롬프트를 스크립트에서 분리해 둔다.
 * 여기를 고치고 --dry-run 으로 확인한 뒤 실제 실행하는 흐름을 의도했다.
 *
 * 응답 형식과 요청 본문(표제어·영어 뜻풀이·태그)은 언어와 상관없이 같고, 언어마다 다른 것은 시스템 프롬프트뿐이다.
 */

export const TRANSLATION_MODEL = 'gemini-3.8-flash'

/** 생성해서 넣는 뜻 언어. en은 JMdict 원문이라 번역 대상이 아니다. */
export const TARGET_LANGUAGES = ['ko', 'es'] as const satisfies readonly Language[]
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number]

export const TARGET_LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  ko: '한국어',
  es: '스페인어',
}

export function isTargetLanguage(value: string): value is TargetLanguage {
  return (TARGET_LANGUAGES as readonly string[]).includes(value)
}

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

const KO_SYSTEM_PROMPT = `당신은 일본어-한국어 사전을 만드는 편집자다. 일본어 표제어와 그 영어 뜻풀이를 받아 한국어 뜻을 작성한다.

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

/**
 * 스페인어는 일본어와 한자어를 공유하지 않아서 영어 뜻풀이가 뜻을 고르는 주된 근거가 되지만,
 * 영어 낱말을 하나씩 옮기지 않고 일본어가 가리키는 뜻을 스페인어로 다시 쓰게 한다.
 * 사용자가 중남미 사람이라 중남미에서 널리 쓰는 말을 고른다(computadora, celular, carro/auto).
 */
const ES_SYSTEM_PROMPT = `당신은 일본어-스페인어 사전을 만드는 편집자다. 일본어 표제어와 그 영어 뜻풀이(JMdict)를 받아 스페인어 뜻을 작성한다.
읽는 사람은 중남미(라틴 아메리카) 스페인어 사용자다.

## 가장 중요한 원칙

영어 낱말을 하나씩 스페인어로 옮기지 마라. 영어 뜻풀이는 "이 표제어의 여러 의미 중 어느 쪽인가"를 알려주는 참고 자료다.
일본어 표제어가 실제로 가리키는 뜻을 파악하고, 그 뜻을 스페인어로 가장 자연스럽게 나타내는 말을 고른다.

  我慢 (がまん) — 영어: patience; endurance; self-control
    ✗ paciencia, resistencia, autocontrol   ← 영어를 그대로 옮김
    ○ aguante, paciencia                     ← 이 단어가 실제로 쓰이는 방식(참고 견딤)

  いただきます — 영어: expression of gratitude before meals
    ✗ expresión de gratitud antes de las comidas
    ○ glosses ["¡Buen provecho!"], note "se dice antes de comer, agradeciendo la comida"

## 표기와 말 고르기

- 중남미에서 널리 쓰는 말을 고른다. 지역마다 다르면 가장 넓게 통하는 말을 먼저 쓴다
  (computadora, celular, carro/auto, jugo, departamento). 스페인에서만 쓰는 말(ordenador, móvil, zumo, coche)은 피한다.
- 강세 부호·ñ·¿¡ 를 바르게 쓴다. 고유명사가 아니면 소문자로 시작한다.
- 한 gloss 안에는 쉼표를 쓰지 않는다. 화면이 glosses를 쉼표로 이어 보여준다.
- 영어 낱말을 그대로 쓰지 않는다. 스페인어로 굳은 외래어(internet, fútbol, chat)는 괜찮다.

## 작성 규칙

1. 품사에 맞는 사전형으로 쓴다.
   - 명사 → 관사 없이 단수형 (agua, tiempo). 복수로만 쓰는 말은 복수형.
   - 동사 → 원형 (comer, ir). 목적어나 전치사가 필요하면 짧게 붙인다 (dar algo a alguien, pensar en).
     재귀동사는 -se 꼴로 쓴다 (levantarse).
   - い형용사·な형용사 → 형용사 남성 단수 (grande, tranquilo).
   - する가 붙는 명사(する동사) → 명사로 쓴다. 勉強 → estudio (○) / estudiar (✗).
   - 부사 → 부사 (despacio, seguramente).
   - 감탄사·인사말·관용 표현 → 그 상황에서 실제로 쓰는 스페인어 (ありがとう → gracias / おはよう → buenos días).

2. 조사·조동사·접두사·접미사·조수사처럼 한 단어로 대응하지 않는 문법 요소는
   가장 가까운 스페인어(と → y, con / から → desde, de / まで → hasta)를 쓰고, 쓰임은 note에 적는다.
   대응하는 말이 정말 없으면 괄호 안에 짧은 스페인어 설명을 쓴다(～本 → "(contador de objetos largos)").

3. glosses는 대표성 순으로 1~3개. 억지로 채우지 않는다. 하나로 충분하면 하나만 쓴다.

4. 일본 고유의 문물은 널리 알려진 이름(sushi, kimono, samurái)이 있으면 그것을 쓰고, 없으면 짧은 설명구를 쓴다.
   고유명사는 스페인어 이름이 있으면 그것(日本 → Japón / 東京 → Tokio / 中国 → China), 없으면 로마자로 쓴다.

5. 태그를 반영한다.
   - 용법 uk = 보통 가나로 표기하는 단어. 한자 표기의 뜻에 끌리지 마라.
   - 용법 arch(고어)·obs(폐어) = 가장 가까운 말을 쓰고 필요하면 note에 "arcaico"라고 적는다.
   - 용법 col(구어)·sl(속어)·vulg(비속어) = 격에 맞는 말을 고르고, 필요하면 note에 "coloquial", "vulgar"라고 적는다.
   - 용법 hon(존경어)·hum(겸양어) = note에 "honorífico", "humilde" 등으로 적는다.
   - 분야 태그(med, comp, bot 등) = 그 분야에서 실제로 쓰는 스페인어 용어를 쓴다.

6. note는 꼭 필요할 때만 스페인어로 짧게 쓴다. 대부분은 null이다.
   필요한 경우 — 스페인어에 대응어가 없을 때, 비슷한 단어와 구분이 필요할 때, 사용 맥락에 제약이 있을 때.
   예) あげる → glosses ["dar"], note "yo a otra persona" / くれる → glosses ["dar"], note "otra persona a mí"
   예시를 들 때는 "p. ej."로 쓴다. note에는 일본어를 써도 된다.

7. 같은 표제어의 여러 뜻은 서로 구별되게 쓴다. 뜻 1과 뜻 2가 같은 스페인어가 되면 안 된다.

8. 확신이 없으면 그럴듯한 말을 지어내지 말고, 가장 가까운 말을 쓴 뒤 note에 불확실한 지점을 적는다.

## 출력

입력에 있는 모든 sense를 senseId 그대로 돌려준다. 하나도 빠뜨리지 마라.`

export const SYSTEM_PROMPTS: Record<TargetLanguage, string> = {
  ko: KO_SYSTEM_PROMPT,
  es: ES_SYSTEM_PROMPT,
}

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

export function buildUserMessage(words: WordInput[], lang: TargetLanguage): string {
  const total = words.reduce((n, w) => n + w.senses.length, 0)
  return [
    `아래 ${words.length}개 표제어, ${total}개 뜻에 대해 ${TARGET_LANGUAGE_NAMES[lang]} 뜻을 작성하라.`,
    '',
    words.map(formatWord).join('\n\n'),
  ].join('\n')
}
