import type { Dictionary } from './ko'

const en: Dictionary = {
  meta: {
    title: 'niben — Japanese Vocabulary',
    description: 'Learn Japanese words in order of how often they are used',
    wordsTitle: 'All words',
  },
  header: {
    tagline: 'Learn Japanese words in order of how often they are used',
  },
  nav: {
    label: 'Switch view',
    random: 'Random 50',
    words: 'All words',
    language: 'Language',
  },
  footer: {
    dictionary: 'Dictionary data',
    frequency: 'Frequency data',
    frequencyList: 'all-media frequency list',
  },
  status: {
    loading: 'Loading dictionary data…',
    loadFailed: 'Could not load dictionary data ({status})',
    missingStudy: 'Word data (public/data/study.json) is missing. Run npm run data:export or npm run data:local first.',
    missingWords: 'Word data (public/data/words.json) is missing. Run npm run data:export or npm run data:local first.',
  },
  random: {
    summary: '{count} words picked at random from the {total} most common words.',
    redraw: 'Shuffle again',
    empty: 'No words have meanings in this language yet. You can browse other languages in All words.',
  },
  words: {
    searchLabel: 'Search words',
    searchPlaceholder: 'Search by Japanese, reading, or meaning',
    count: '{n} words',
    ofTotal: ' / {total} total',
    notFound: 'No matching words.',
    more: 'Show more ({shown} / {total})',
    noKorean: '',
    partialKorean: '',
    filters: {
      all: 'All',
      noun: 'Nouns',
      verb: 'Verbs',
      adj: 'Adjectives',
      adverb: 'Adverbs',
      other: 'Other',
    },
  },
  word: {
    freq: 'Top {n}',
  },
  pos: {
    noun: 'noun',
    pronoun: 'pronoun',
    verb_godan: 'godan verb',
    verb_ichidan: 'ichidan verb',
    verb_irregular: 'irregular verb',
    adj_i: 'i-adjective',
    adj_na: 'na-adjective',
    adverb: 'adverb',
    adnominal: 'pre-noun adjectival',
    conjunction: 'conjunction',
    particle: 'particle',
    auxiliary: 'auxiliary',
    interjection: 'interjection',
    prefix: 'prefix',
    suffix: 'suffix',
    counter: 'counter',
    expression: 'expression',
    other: 'other',
  },
}

export default en
