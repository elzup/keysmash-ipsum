import { type Layout, smashWordEn, type Word } from './en.ts'
import { smashWordKana } from './kana.ts'
import { between, createRng, pick, type Range, type Rng } from './rng.ts'

export type Lang = 'en' | 'ja'
export type GenerateOptions = {
  /** 同じ seed → 同じ文字列。省略時は現在時刻 */
  seed?: string
  /** 文の数 */
  count?: number
  /** 1 文の語数。`{ min: 1, max: 1 }` なら文末記号なしの 1 単語 */
  words?: Range
  /** 1 語の長さ。en は文字数、ja は助詞を除いたかなの数 */
  wordLen?: Range
  /** en: qwerty = 隣接キーの手癖 / uniform = a–z 均等。ja: qwerty = 頻度表 / uniform = かな均等 */
  layout?: Layout
  lang?: Lang
  /** 区切り候補。先頭が PRIMARY_SEP_RATE、残りで等分 */
  seps?: string
}
export type ResolvedOptions = Required<GenerateOptions>
export type Sentence = { text: string; words: Word[] }

// 区切りの先頭文字 (既定は空白) が選ばれる確率。残りを他の区切り文字で等分する
const PRIMARY_SEP_RATE = 0.85
// 1 語の長さの既定。en は文字数、ja は助詞を除いたかなの数 (日本語の文節は 2〜5 かな程度が多い)
const DEFAULT_WORD_LEN: Record<Lang, Range> = {
  en: { min: 2, max: 8 },
  ja: { min: 2, max: 5 },
}
const DEFAULT_WORDS: Range = { min: 4, max: 9 }
const JA_PUNCT: Record<string, string> = { ',': '、', '.': '。' }

const assertRange = (range: Range, name: string): void => {
  const isInt = Number.isInteger(range.min) && Number.isInteger(range.max)
  if (!isInt || range.min < 1 || range.max < range.min) {
    throw new Error(`${name} の範囲が不正です: ${range.min}-${range.max}`)
  }
}

export const resolveOptions = (opts: GenerateOptions = {}): ResolvedOptions => {
  const lang = opts.lang ?? 'en'
  const resolved: ResolvedOptions = {
    seed: opts.seed ?? String(Date.now()),
    count: opts.count ?? 1,
    words: opts.words ?? DEFAULT_WORDS,
    wordLen: opts.wordLen ?? DEFAULT_WORD_LEN[lang],
    layout: opts.layout ?? 'qwerty',
    lang,
    seps: opts.seps ?? ' ,',
  }
  if (!Number.isInteger(resolved.count) || resolved.count < 1) {
    throw new Error(`count は 1 以上の整数: ${resolved.count}`)
  }
  if (resolved.seps.length === 0) throw new Error('seps は 1 文字以上')
  assertRange(resolved.words, 'words')
  assertRange(resolved.wordLen, 'wordLen')
  return resolved
}

const pickSep = (rng: Rng, seps: string): string => {
  const [primary = ' ', ...rest] = [...seps]
  if (rest.length === 0 || rng() < PRIMARY_SEP_RATE) return primary
  const sep = pick(rng, rest)
  return sep === ' ' ? sep : `${sep} `
}

const toJaPunct = (line: string): string =>
  [...line]
    .map((ch) => JA_PUNCT[ch] ?? ch)
    .join('')
    .replace(/、 /g, '、')

const smashSentence = (rng: Rng, opts: ResolvedOptions): Sentence => {
  const wordCount = between(rng, opts.words)
  const words = Array.from({ length: wordCount }, () => {
    const len = between(rng, opts.wordLen)
    return opts.lang === 'ja'
      ? smashWordKana(rng, len, opts.layout === 'uniform')
      : smashWordEn(rng, len, opts.layout)
  })
  // 1 語だけのときはラベルや仮の名前に使うので文末記号を付けない
  const end = wordCount === 1 ? '' : '.'
  const raw =
    words.reduce(
      (acc, word, i) =>
        i === 0 ? word.text : acc + pickSep(rng, opts.seps) + word.text,
      ''
    ) + end
  return { text: opts.lang === 'ja' ? toJaPunct(raw) : raw, words }
}

/** keysmash 文字列を seed から決定的に生成する。LLM は使わない */
export const generate = (opts: GenerateOptions = {}): Sentence[] => {
  const resolved = resolveOptions(opts)
  const rng = createRng(resolved.seed)
  return Array.from({ length: resolved.count }, () =>
    smashSentence(rng, resolved)
  )
}
