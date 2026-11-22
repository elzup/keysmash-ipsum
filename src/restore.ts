import type { Word } from './en.ts'
import { type GenerateOptions, generate, type Sentence } from './generate.ts'
import { buildRequest, parseRestored } from './prompt.ts'
import {
  type PromptOptions,
  RestoreMismatchError,
  type RestoreRequest,
} from './request.ts'
import { buildWordsRequest, parseWords } from './words.ts'

/**
 * 型どおりでない出力 (安全分類器の拒否・出力上限での打ち切りなど) は structured output でも起こりうるので、
 * そのときだけやり直す。2 回続いたら諦めて throw
 */
const MAX_ATTEMPTS = 2

/**
 * 依頼 (system / prompt / JSON Schema) を受け、LLM の structured output を JSON 値で返す関数。
 * provider・キー・リトライは呼び出し側が持つ。schema は必ず provider の structured output に渡すこと
 */
export type Complete = (request: RestoreRequest) => Promise<unknown>
export type RestoreOptions = PromptOptions & { complete: Complete }
export type IpsumResult = { keysmash: string; text: string }

const withRetry = async <T>(
  request: RestoreRequest,
  complete: Complete,
  parse: (output: unknown) => T,
  attempt = 1
): Promise<T> => {
  const output = await complete(request)
  try {
    return parse(output)
  } catch (error) {
    const canRetry =
      error instanceof RestoreMismatchError && attempt < MAX_ATTEMPTS
    if (!canRetry) throw error
    return withRetry(request, complete, parse, attempt + 1)
  }
}

/** keysmash の各文を、文として LLM に 1 回で読み解かせる */
export const restore = async (
  sentences: readonly Sentence[],
  opts: RestoreOptions
): Promise<string[]> => {
  if (sentences.length === 0) return []
  return withRetry(buildRequest(sentences, opts), opts.complete, (output) =>
    parseRestored(output, sentences, opts)
  )
}

/** keysmash の各語を、文にせず 1 語ずつ独立した単語として LLM に 1 回で読み解かせる */
export const restoreWords = async (
  words: readonly Word[],
  opts: RestoreOptions
): Promise<string[]> => {
  if (words.length === 0) return []
  return withRetry(buildWordsRequest(words, opts), opts.complete, (output) =>
    parseWords(output, words)
  )
}

/** generate → restore をまとめて行う */
export const keysmashIpsum = async (
  opts: GenerateOptions & RestoreOptions
): Promise<IpsumResult[]> => {
  const sentences = generate(opts)
  const texts = await restore(sentences, opts)
  return sentences.map((sentence, i) => ({
    keysmash: sentence.text,
    text: texts[i] ?? '',
  }))
}
