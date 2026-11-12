import type { PartOfSpeech } from '@/db/schema'

/**
 * 한국어 화면 문구. 다른 언어 사전은 이 객체와 같은 모양이어야 한다(Dictionary 타입).
 * 자리표시자 {n} 등은 i18n/config.ts 의 format 으로 채운다.
 */
const ko = {
  meta: {
    title: 'niben — 일본어 단어장',
    description: '자주 쓰이는 순서대로 익히는 일본어 단어장',
    wordsTitle: '전체 단어',
  },
  header: {
    tagline: '자주 쓰이는 순서대로 익히는 일본어 단어장',
  },
  nav: {
    label: '화면 전환',
    random: '랜덤 50단어',
    words: '전체 단어',
    language: '언어',
  },
  footer: {
    dictionary: '사전 데이터',
    frequency: '빈도 데이터',
    frequencyList: '전체 매체 빈도 목록',
  },
  status: {
    loading: '사전 데이터를 불러오는 중…',
    loadFailed: '사전 데이터를 불러오지 못했습니다 ({status})',
    missingStudy: '단어 데이터(public/data/study.json)가 없습니다. npm run data:export 또는 npm run data:local 을 먼저 실행하세요.',
    missingWords: '단어 데이터(public/data/words.json)가 없습니다. npm run data:export 또는 npm run data:local 을 먼저 실행하세요.',
  },
  random: {
    summary: '자주 쓰는 상위 단어 {total}개 중 {count}개를 무작위로 골랐습니다.',
    redraw: '다시 뽑기',
    empty: '아직 이 언어로 뜻이 있는 단어가 없습니다. 전체 단어 탭에서 다른 언어 뜻으로 볼 수 있습니다.',
  },
  words: {
    searchLabel: '단어 검색',
    searchPlaceholder: '일본어, 읽기, 뜻(한국어·영어)으로 검색',
    count: '{n}개 단어',
    ofTotal: ' / 전체 {total}개',
    notFound: '찾는 단어가 없습니다.',
    more: '더 보기 ({shown} / {total})',
    noKorean: '한국어 뜻은 아직 생성 전이라 JMdict의 영어 뜻을 보여줍니다.',
    partialKorean: '한국어 뜻은 {n}개 단어에만 있습니다. 나머지는 영어 뜻을 보여줍니다.',
    filters: {
      all: '전체',
      noun: '명사',
      verb: '동사',
      adj: '형용사',
      adverb: '부사',
      other: '기타',
    },
  },
  word: {
    freq: '빈도 {n}위 안',
  },
  study: {
    open: '예문·연습',
    back: '뒤로가기',
    notFound: '이 화면에서 찾을 수 없는 단어입니다.',
    examples: '예문',
    noExamples: '이 단어는 아직 예문이 없습니다. 작문 연습은 할 수 있습니다.',
    loadingExamples: '예문을 불러오는 중…',
    examplesFailed: '예문을 불러오지 못했습니다.',
    senseLabel: '뜻 {n}',
    showMeaning: '뜻 보기',
    hideMeaning: '뜻 숨기기',
    translateLabel: '이 문장을 해석해 보세요',
    translatePlaceholder: '한국어로 뜻을 써 보세요',
    composeTitle: '작문해 보기',
    composeLabel: '이 단어로 일본어 문장을 써 보세요: 「{word}」',
    composePlaceholder: '일본어로 써 보세요',
    check: '채점하기',
    checking: '채점 중…',
    correct: '맞았습니다',
    incorrect: '다시 생각해 보세요',
    betterTranslation: '모범 번역',
    suggestion: '고친 문장',
    poweredBy: '채점: Gemini (틀릴 수 있습니다)',
    errors: {
      rate_limited: '요청이 너무 많습니다. 잠시 뒤에 다시 해 보세요.',
      quota: '채점 한도를 다 썼습니다. 나중에 다시 해 보세요.',
      not_configured: '지금은 채점 기능을 쓸 수 없습니다.',
      failed: '채점하지 못했습니다. 잠시 뒤에 다시 해 보세요.',
    },
  },
  pos: {
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
  } satisfies Record<PartOfSpeech, string>,
}

export type Dictionary = typeof ko

export default ko
