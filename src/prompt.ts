import type { Lang, Sentence } from './generate.ts'

export type PromptOptions = {
  lang?: Lang
  /** true: 1 語 → 1 語 (ja は 1 文節) を schema で固定する。false: 1 文 → 1 文字列で意訳を許す */
  strict?: boolean
}

/** structured output に渡す JSON Schema (Anthropic / OpenAI / claude -p の --json-schema にそのまま渡せる形) */
export type JsonSchema = { [key: string]: unknown }

export type RestoreRequest = {
  system: string
  prompt: string
  schema: JsonSchema
}

const LANG_NAME: Record<Lang, string> = { en: 'English', ja: 'Japanese' }
// LLM が語に句読点や空白を付けてきても、区切りは元の keysmash から組み直すので剥がしてよい
const EDGE_PUNCT = /^[\s.,、。]+|[\s.,、。]+$/g

const SYSTEM =
  'You restore keysmash (mistyped text) into the sentence the typist most plausibly intended. Answer only through the given JSON schema.'

const sentenceKey = (i: number): string => `s${i + 1}`
const wordKey = (i: number): string => `w${i + 1}`

const objectSchema = (
  keys: string[],
  value: (key: string, i: number) => JsonSchema
): JsonSchema => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((key, i) => [key, value(key, i)])),
  required: keys,
  additionalProperties: false,
})

/**
 * 出力の形を固定する schema。配列の長さ制約 (minItems 等) は Anthropic の structured output が
 * 対応していないので、文と語を必須プロパティの並びで表して個数を構造で保証する
 */
export const buildSchema = (
  sentences: readonly Sentence[],
  opts: PromptOptions = {}
): JsonSchema => {
  const keys = sentences.map((_, i) => sentenceKey(i))
  if (opts.strict === false) {
    return objectSchema(keys, () => ({ type: 'string' }))
  }
  return objectSchema(keys, (_, i) =>
    objectSchema(
      (sentences[i]?.words ?? []).map((_, j) => wordKey(j)),
      () => ({ type: 'string' })
    )
  )
}

const describeSentence = (
  sentence: Sentence,
  i: number,
  isStrict: boolean
): string => {
  const head = `${sentenceKey(i)}: ${sentence.text}`
  if (!isStrict) return head
  const words = sentence.words.map((word, j) => `${wordKey(j)}=${word.text}`)
  return `${head}\n    ${words.join(' ')}`
}

/** keysmash を読み解かせる依頼一式 (system / prompt / schema) を作る */
export const buildRequest = (
  sentences: readonly Sentence[],
  opts: PromptOptions = {}
): RestoreRequest => {
  const lang = opts.lang ?? 'en'
  const isStrict = opts.strict !== false
  const unit = lang === 'ja' ? 'bunsetsu (文節)' : 'word'
  const rules = [
    `Each item is a keysmash: someone tried to type a ${LANG_NAME[lang]} sentence and mistyped it. Guess the most plausible intended sentence.`,
    isStrict
      ? `- Answer one ${unit} for each keysmash word key (w1, w2, ...). Never leave one empty, even if the guess is a stretch.`
      : '- Answer one sentence per item. Free paraphrase is allowed.',
    '- Prefer spelling closeness (same or adjacent keys, similar length) first, then make it grammatical.',
    lang === 'ja'
      ? '- Input is mistyped hiragana. Answer natural kana-kanji Japanese.'
      : '- Capitalize as the sentence needs.',
    isStrict
      ? '- Do not include punctuation or spaces in a word; they are restored from the input.'
      : '- Keep the punctuation of the input.',
  ]
  const input = sentences.map((sentence, i) =>
    describeSentence(sentence, i, isStrict)
  )
  return {
    system: SYSTEM,
    prompt: [...rules, '', ...input].join('\n'),
    schema: buildSchema(sentences, opts),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown, path: string): string => {
  const text = typeof value === 'string' ? value.replace(EDGE_PUNCT, '') : ''
  if (text.length === 0)
    throw new Error(`LLM の出力の ${path} が空か文字列ではありません`)
  return text
}

const readObject = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value))
    throw new Error(`LLM の出力の ${path} がオブジェクトではありません`)
  return value
}

/** 元の keysmash の区切り (空白・句読点) を語の間に戻す。ja は空白を消し、句読点だけ残す */
const assemble = (sentence: Sentence, words: string[], lang: Lang): string => {
  const { pos, gaps } = sentence.words.reduce(
    (acc, word) => {
      const at = sentence.text.indexOf(word.text, acc.pos)
      return {
        pos: at + word.text.length,
        gaps: [...acc.gaps, sentence.text.slice(acc.pos, at)],
      }
    },
    { pos: 0, gaps: [] as string[] }
  )
  const tail = sentence.text.slice(pos)
  const fix = (gap: string): string =>
    lang === 'ja' ? gap.replace(/\s+/g, '') : gap
  const text =
    words
      .map((word, i) => (i === 0 ? '' : fix(gaps[i] ?? ' ')) + word)
      .join('') + fix(tail)
  // 小さいモデルは文頭の大文字化をよく落とす。en の文頭は必ず大文字なので LLM に任せず決め打ちする
  return lang === 'en' ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/**
 * structured output の結果を検証して文ごとの文字列にする。
 * schema どおりでない (キー欠け・空文字・型違い) なら throw し、黙って欠けさせない
 */
export const parseRestored = (
  output: unknown,
  sentences: readonly Sentence[],
  opts: PromptOptions = {}
): string[] => {
  const root = readObject(output, 'root')
  const lang = opts.lang ?? 'en'
  return sentences.map((sentence, i) => {
    const key = sentenceKey(i)
    if (opts.strict === false) return readString(root[key], key)
    const item = readObject(root[key], key)
    const words = sentence.words.map((_, j) =>
      readString(item[wordKey(j)], `${key}.${wordKey(j)}`)
    )
    return assemble(sentence, words, lang)
  })
}
