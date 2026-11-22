/** words モード: keysmash の語を、文にせず 1 語ずつ独立した単語として読み解かせる */
import type { Word } from './en.ts'
import { type GenerateOptions, generate } from './generate.ts'
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
  wordKey,
} from './request.ts'

export type WordsOptions = Omit<GenerateOptions, 'count' | 'words' | 'seps'> & {
  /** 語数 */
  count?: number
}

/** keysmash の語を count 個、seed から決定的に作る。LLM は使わない */
export const generateWords = (opts: WordsOptions = {}): Word[] => {
  const count = opts.count ?? 1
  const [sentence] = generate({ ...opts, words: { min: count, max: count } })
  return sentence?.words ?? []
}

/** 語 w1.. を必須キーで固定する schema。語数が構造で保証される */
export const buildWordsSchema = (words: readonly Word[]): JsonSchema =>
  objectSchema(
    words.map((_, i) => wordKey(i)),
    () => STRING_SCHEMA
  )

/** keysmash の語を 1 語ずつ読み解かせる依頼一式 (system / prompt / schema) を作る */
export const buildWordsRequest = (
  words: readonly Word[],
  opts: Pick<PromptOptions, 'lang'> = {}
): RestoreRequest => {
  const lang = opts.lang ?? 'en'
  const rules = [
    `Each keysmash below is a single ${LANG_NAME[lang]} word someone tried to type and mistyped. Guess the intended word for each key (w1, w2, ...).`,
    '- Treat every word on its own. Do not connect them into a sentence, a phrase or a common theme.',
    '- Answer one real word per key. Never leave one empty, even if the guess is a stretch.',
    '- Prefer spelling closeness (same or adjacent keys, similar length).',
    lang === 'ja'
      ? '- Input is mistyped hiragana. Answer the word as it is usually written (kanji, kana or katakana).'
      : '- Use lowercase unless the word is a proper noun.',
    '- Do not include punctuation or spaces in a word.',
  ]
  const input = words.map((word, i) => `${wordKey(i)}: ${word.text}`)
  return {
    system: SYSTEM,
    prompt: [...rules, '', ...input].join('\n'),
    schema: buildWordsSchema(words),
  }
}

/** structured output の結果を検証して語ごとの文字列にする。キー欠け・空文字・型違いは RestoreMismatchError */
export const parseWords = (
  output: unknown,
  words: readonly Word[]
): string[] => {
  const root = readObject(output, 'root')
  return words.map((_, i) => readString(root[wordKey(i)], wordKey(i)))
}
