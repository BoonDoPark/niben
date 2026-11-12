import type {
  ConjugationClass,
  DataSource,
  JlptLevel,
  Language,
  PartOfSpeech,
} from './schema'

/** 화면에 보여줄 품사 이름. enum 값 자체는 영문 슬러그라 그대로 노출하지 않는다. */
export const partOfSpeechLabels: Record<PartOfSpeech, string> = {
  noun: '명사',
  pronoun: '대명사',
  verb_godan: '5단동사',
  verb_ichidan: '1단동사',
  verb_irregular: '불규칙동사',
  adj_i: 'い형용사',
  adj_na: 'な형용사',
  adverb: '부사',
  adnominal: '연체사',
  conjunction: '접속사',
  particle: '조사',
  auxiliary: '조동사',
  interjection: '감동사',
  prefix: '접두사',
  suffix: '접미사',
  counter: '조수사',
  expression: '관용구',
  other: '기타',
}

/**
 * 활용 클래스 표시명. 예외 클래스는 사용자에게 굳이 구분해 보여줄 필요가 없어
 * 기본 클래스와 같은 이름을 쓴다. 구분은 활용 생성기 내부에서만 의미가 있다.
 */
export const conjugationClassLabels: Record<ConjugationClass, string> = {
  godan: '5단동사',
  godan_iku: '5단동사',
  godan_aru: '5단동사',
  godan_uru: '5단동사',
  godan_honorific: '5단동사',
  ichidan: '1단동사',
  ichidan_kureru: '1단동사',
  suru: '불규칙동사',
  suru_special: 'する동사',
  suru_noun: 'する동사',
  kuru: '불규칙동사',
  adj_i: 'い형용사',
  adj_i_ii: 'い형용사',
  adj_na: 'な형용사',
}

export const jlptLevelLabels: Record<JlptLevel, string> = {
  N5: 'N5',
  N4: 'N4',
  N3: 'N3',
  N2: 'N2',
  N1: 'N1',
}

export const languageLabels: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  la: 'Latina',
}

export const dataSourceLabels: Record<DataSource, string> = {
  jmdict: 'JMdict',
  tatoeba: 'Tatoeba',
  kanjium: 'Kanjium',
  wiktionary: '위키낱말사전',
  llm: 'AI 생성',
  manual: '직접 입력',
  other: '기타',
}

/** 쉬운 순서. 학습 순서 정렬과 레벨 선택 UI에 쓴다. */
export const jlptLevelOrder: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1']

/** 앱이 뜻을 보여줄 때 쓰는 기본 언어. */
export const defaultLanguage: Language = 'ko'
