/** sentences モード: keysmash の文を、文として読み解かせる */
import type { Lang, Sentence } from './generate.ts'
import {
  type JsonSchema,
  LANG_NAME,
  objectSchema,
  type PromptOptions,
  type RestoreRequest,
  readObject,
  readString,
  STRING_SCHEMA,
  SYSTEM,
  sentenceKey,
  wordKey,
} from './request.ts'

/** 文 s1.. × 語 w1.. を必須キーで固定する schema。語数が構造で保証される */
export const buildSchema = (
  sentences: readonly Sentence[],
  opts: PromptOptions = {}
): JsonSchema => {
  const keys = sentences.map((_, i) => sentenceKey(i))
  if (opts.strict === false) return objectSchema(keys, () => STRING_SCHEMA)
  return objectSchema(keys, (i) =>
    objectSchema(
      (sentences[i]?.words ?? []).map((_, j) => wordKey(j)),
      () => STRING_SCHEMA
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

/** keysmash の文を読み解かせる依頼一式 (system / prompt / schema) を作る */
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
 * schema どおりでない (キー欠け・空文字・型違い) なら RestoreMismatchError で throw し、黙って欠けさせない
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
