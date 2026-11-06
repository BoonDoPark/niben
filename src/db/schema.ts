import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * 사전 데이터 스키마.
 *
 * 이 DB는 런타임 조회용이 아니라 "단어를 작성하고 검수하는 곳"이다.
 * 앱에 나가는 데이터는 빌드 시점에 여기서 정적 JSON으로 추출한다.
 * 학습 진도는 서버에 저장하지 않고 브라우저 IndexedDB에만 존재하므로
 * 사용자 관련 테이블은 여기에 없다.
 *
 * 뜻과 예문은 언어별로 분리되어 있다(sense_translations, example_translations).
 * JMdict의 영어 gloss를 원본 그대로 보관하고 한국어를 그 옆에 두기 위한 구조다.
 * 번역을 원본과 대조해 검수할 수 있고, 언어를 추가하는 것이 데이터 추가로 끝난다.
 */

/** 품사. 화면 표시와 필터링용이다. 활용 규칙은 conjugationClass가 담당한다. */
export const partOfSpeech = pgEnum('part_of_speech', [
  'noun',
  'pronoun',
  'verb_godan',
  'verb_ichidan',
  'verb_irregular',
  'adj_i',
  'adj_na',
  'adverb',
  'adnominal',
  'conjunction',
  'particle',
  'auxiliary',
  'interjection',
  'prefix',
  'suffix',
  'counter',
  'expression',
  'other',
])

/**
 * 활용 클래스. 활용형 자동 생성기가 분기하는 기준이다.
 *
 * pos와 나누는 이유는 둘의 목적이 다르기 때문이다. pos는 화면 표시와 필터링용이고,
 * 이쪽은 "어떤 규칙으로 활용하는가"만 담는다. 같은 5단동사라도 行く처럼 예외가
 * 있어서 1:1로 대응되지 않는다.
 *
 * 각 값은 JMdict 품사 태그와 대응하므로 임포트 시 자동으로 채울 수 있다.
 * 예외가 더 발견되면 값을 추가하면 된다(ALTER TYPE ... ADD VALUE).
 */
export const conjugationClass = pgEnum('conjugation_class', [
  'godan', // v5k, v5r, v5m ... — 어미 가나로 행을 판별
  'godan_iku', // v5k-s   行く — て/た형이 行って/行った
  'godan_aru', // v5r-i   ある — 부정형이 ない
  'godan_uru', // v5u-s   問う — て형이 問うて
  'godan_honorific', // v5aru  いらっしゃる — ます형이 ～います
  'ichidan', // v1      食べる, 見る
  'ichidan_kureru', // v1-s    くれる — 명령형이 くれろ가 아닌 くれ
  'suru', // vs-i    する
  'suru_special', // vs-s    愛する — 부정형이 愛さない
  'suru_noun', // vs      勉強(する) — 명사에 する가 붙는 형태
  'kuru', // vk      来る
  'adj_i', // adj-i   高い
  'adj_i_ii', // adj-ix  いい/良い — よくない, よかった
  'adj_na', // adj-na  静か
])

export const jlptLevel = pgEnum('jlpt_level', ['N5', 'N4', 'N3', 'N2', 'N1'])

/**
 * 번역 언어.
 *
 * 'en'은 JMdict 원본 gloss를 그대로 담는 자리다. 한국어 번역의 대조 기준이자
 * 재번역 시의 원본이 된다. 언어 추가는 값 하나 늘리는 마이그레이션으로 끝난다.
 */
export const language = pgEnum('language', ['ko', 'en', 'ja'])

/** 데이터 출처. 재임포트 시 "내가 손댄 것"을 지키기 위해 필요하다. */
export const dataSource = pgEnum('data_source', [
  'jmdict',
  'tatoeba',
  'kanjium',
  'wiktionary',
  'llm',
  'manual',
  'other',
])

// ---------------------------------------------------------------------------
// words — 표제어
// ---------------------------------------------------------------------------

export const words = pgTable(
  'words',
  {
    id: serial('id').primaryKey(),

    /** 표기. 한자를 쓰지 않는 단어(ありがとう 등)는 reading과 같은 값을 넣는다. */
    lemma: text('lemma').notNull(),
    /** 히라가나 읽기. 표기가 같아도 읽기가 다르면 다른 단어다(生 = なま / せい / き). */
    reading: text('reading').notNull(),

    pos: partOfSpeech('pos').notNull().default('other'),

    /**
     * 활용 규칙. null이면 활용하지 않는 단어(명사, 부사 등).
     * 勉強처럼 명사이면서 する가 붙는 단어는 pos='noun' + 'suru_noun' 조합이 된다.
     */
    conjugationClass: conjugationClass('conjugation_class'),

    /** 악센트 핵의 위치(모라 단위). 0은 헤이반(平板), null은 미상. kanjium에서 온다. */
    accent: integer('accent'),

    /**
     * JLPT는 2010년 이후 공식 어휘 목록이 없어서 시중 목록은 전부 추정치다.
     * 학습 순서의 기준은 usageRank로 잡고, 이 컬럼은 참고용으로만 둔다.
     */
    jlptLevel: jlptLevel('jlpt_level'),

    /**
     * 신문 빈도 순위. 낮을수록 자주 쓰인다.
     * JMdict의 nf01~nf48 태그(마이니치신문 코퍼스, 500단어 구간)에서 환산한다.
     *
     * 신문 기사 기준이라 한자 명사가 상위를 차지하고 동사·형용사·부사는 크게 밀린다
     * (食べる 1만 4천 번째, 委員会 수백 번째). 그래서 학습 순서에는 usageRank를 먼저 쓰고,
     * 이 값은 usageRank가 없는 단어끼리의 순서를 정할 때만 쓴다.
     */
    freqRank: integer('freq_rank'),

    /**
     * 실사용 빈도 순위. 학습 순서의 1차 기준이다. 낮을수록 자주 쓰인다.
     * jiten.moe 전체 매체 빈도 목록(애니·드라마·소설·영화 등, CC BY-SA 4.0)에서 온다.
     * 활용형을 기본형으로 되돌려 JMdict 단어 단위로 센 값이라 동사도 제 순위를 받는다.
     * 계산 규칙은 scripts/lib/usage-rank.ts 참고.
     */
    usageRank: integer('usage_rank'),

    /** 검색용 정규화 문자열(로마자 등). 빌드 시 채운다. */
    searchKey: text('search_key'),

    /**
     * JMdict 엔트리 번호(ent_seq). JMdict는 매주 갱신되므로 재임포트 때
     * 기존 행과 대조하려면 이 값이 필요하다. 한 엔트리에 표기·읽기 조합이
     * 여러 개일 수 있어 유니크하지 않다.
     */
    jmdictSeq: integer('jmdict_seq'),

    source: dataSource('source').notNull().default('manual'),
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // 중복 임포트를 입구에서 막는 핵심 제약.
    uniqueIndex('words_lemma_reading_uq').on(t.lemma, t.reading),
    index('words_jlpt_level_idx').on(t.jlptLevel),
    index('words_pos_idx').on(t.pos),
    // 활용 퀴즈 대상(활용 클래스가 있는 단어)을 뽑을 때 쓴다.
    index('words_conjugation_class_idx').on(t.conjugationClass),
    index('words_freq_rank_idx').on(t.freqRank),
    index('words_usage_rank_idx').on(t.usageRank),
    index('words_search_key_idx').on(t.searchKey),
    index('words_jmdict_seq_idx').on(t.jmdictSeq),
  ],
)

// ---------------------------------------------------------------------------
// senses — 뜻 (words 1:N). 언어 중립. JMdict의 sense 하나에 대응한다.
// ---------------------------------------------------------------------------

export const senses = pgTable(
  'senses',
  {
    id: serial('id').primaryKey(),
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),

    /** 표시 순서. 0이 대표 뜻. JMdict 엔트리 안에서의 sense 순서와 같다. */
    orderNo: integer('order_no').notNull().default(0),

    /** 뜻에 따라 품사가 달라질 때만 채운다. 비어 있으면 words.pos를 따른다. */
    pos: partOfSpeech('pos'),

    /**
     * JMdict 용법 태그. 'uk'(보통 가나로 표기), 'abbr'(약어), 'arch'(고어) 등.
     * 'uk'는 표시에 직접 영향을 준다 — 학습자에게 한자를 앞세우면 안 되는 단어들이다.
     */
    miscTags: text('misc_tags').array(),
    /** JMdict 분야 태그. 'comp'(컴퓨터), 'med'(의학) 등. 번역 정확도에 도움이 된다. */
    fieldTags: text('field_tags').array(),

    source: dataSource('source').notNull().default('manual'),
    /**
     * 이 뜻을 앱에 실을지 검토했는가.
     * JMdict에는 고어와 전문용어도 섞여 있어 취사선택이 필요하다.
     * 번역이 맞는지는 senseTranslations.verified가 따로 담당한다.
     */
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('senses_word_id_order_no_idx').on(t.wordId, t.orderNo),
    index('senses_verified_source_idx').on(t.verified, t.source),
  ],
)

// ---------------------------------------------------------------------------
// sense_translations — 뜻의 언어별 번역
// ---------------------------------------------------------------------------

export const senseTranslations = pgTable(
  'sense_translations',
  {
    id: serial('id').primaryKey(),
    senseId: integer('sense_id')
      .notNull()
      .references(() => senses.id, { onDelete: 'cascade' }),

    lang: language('lang').notNull(),

    /** 번역어 목록. 배열 순서가 곧 우선순위다. 예: ['먹다', '식사하다'] */
    glosses: text('glosses').array().notNull(),
    /** 뉘앙스나 사용 맥락 메모. あげる/くれる 구분 같은 것. */
    note: text('note'),

    source: dataSource('source').notNull().default('manual'),
    /** 이 언어 번역이 맞는가. 실제 검수의 기준이 되는 플래그다. */
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('sense_translations_sense_id_lang_uq').on(t.senseId, t.lang),
    // "아직 검수 안 된 한국어 번역" 같은 조회를 위한 인덱스.
    index('sense_translations_lang_verified_idx').on(t.lang, t.verified),
  ],
)

// ---------------------------------------------------------------------------
// examples — 예문 (senses 1:N). 일본어 원문만 담는다.
// ---------------------------------------------------------------------------

export const examples = pgTable(
  'examples',
  {
    id: serial('id').primaryKey(),
    senseId: integer('sense_id')
      .notNull()
      .references(() => senses.id, { onDelete: 'cascade' }),

    orderNo: integer('order_no').notNull().default(0),

    ja: text('ja').notNull(),
    /** 문장 전체의 가나 읽기. 후리가나 표시에 쓴다. */
    reading: text('reading'),

    source: dataSource('source').notNull().default('manual'),
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('examples_sense_id_order_no_idx').on(t.senseId, t.orderNo),
    index('examples_verified_source_idx').on(t.verified, t.source),
  ],
)

export const exampleTranslations = pgTable(
  'example_translations',
  {
    id: serial('id').primaryKey(),
    exampleId: integer('example_id')
      .notNull()
      .references(() => examples.id, { onDelete: 'cascade' }),

    lang: language('lang').notNull(),
    text: text('text').notNull(),

    source: dataSource('source').notNull().default('manual'),
    verified: boolean('verified').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('example_translations_example_id_lang_uq').on(t.exampleId, t.lang),
    index('example_translations_lang_verified_idx').on(t.lang, t.verified),
  ],
)

// ---------------------------------------------------------------------------
// tags — JLPT 외의 분류 (교재별, 주제별)
// ---------------------------------------------------------------------------

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    /** URL과 파일명에 그대로 쓸 수 있는 식별자. 예: 'genki-1', 'food' */
    slug: text('slug').notNull(),
    nameKo: text('name_ko').notNull(),
    description: text('description'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tags_slug_uq').on(t.slug)],
)

export const wordTags = pgTable(
  'word_tags',
  {
    wordId: integer('word_id')
      .notNull()
      .references(() => words.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.wordId, t.tagId] }),
    index('word_tags_tag_id_idx').on(t.tagId),
  ],
)

// ---------------------------------------------------------------------------
// relations — drizzle query API용
// ---------------------------------------------------------------------------

export const wordsRelations = relations(words, ({ many }) => ({
  senses: many(senses),
  wordTags: many(wordTags),
}))

export const sensesRelations = relations(senses, ({ one, many }) => ({
  word: one(words, { fields: [senses.wordId], references: [words.id] }),
  translations: many(senseTranslations),
  examples: many(examples),
}))

export const senseTranslationsRelations = relations(senseTranslations, ({ one }) => ({
  sense: one(senses, { fields: [senseTranslations.senseId], references: [senses.id] }),
}))

export const examplesRelations = relations(examples, ({ one, many }) => ({
  sense: one(senses, { fields: [examples.senseId], references: [senses.id] }),
  translations: many(exampleTranslations),
}))

export const exampleTranslationsRelations = relations(exampleTranslations, ({ one }) => ({
  example: one(examples, {
    fields: [exampleTranslations.exampleId],
    references: [examples.id],
  }),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  wordTags: many(wordTags),
}))

export const wordTagsRelations = relations(wordTags, ({ one }) => ({
  word: one(words, { fields: [wordTags.wordId], references: [words.id] }),
  tag: one(tags, { fields: [wordTags.tagId], references: [tags.id] }),
}))

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type PartOfSpeech = (typeof partOfSpeech.enumValues)[number]
export type ConjugationClass = (typeof conjugationClass.enumValues)[number]
export type JlptLevel = (typeof jlptLevel.enumValues)[number]
export type Language = (typeof language.enumValues)[number]
export type DataSource = (typeof dataSource.enumValues)[number]

export type Word = typeof words.$inferSelect
export type NewWord = typeof words.$inferInsert
export type Sense = typeof senses.$inferSelect
export type NewSense = typeof senses.$inferInsert
export type SenseTranslation = typeof senseTranslations.$inferSelect
export type NewSenseTranslation = typeof senseTranslations.$inferInsert
export type Example = typeof examples.$inferSelect
export type NewExample = typeof examples.$inferInsert
export type ExampleTranslation = typeof exampleTranslations.$inferSelect
export type NewExampleTranslation = typeof exampleTranslations.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
