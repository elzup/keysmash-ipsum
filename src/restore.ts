import { type GenerateOptions, generate, type Sentence } from './generate.ts'
import {
  buildRequest,
  type PromptOptions,
  parseRestored,
  type RestoreRequest,
} from './prompt.ts'

/**
 * 依頼 (system / prompt / JSON Schema) を受け、LLM の structured output を JSON 値で返す関数。
 * provider・キー・リトライは呼び出し側が持つ。schema は必ず provider の structured output に渡すこと
 */
export type Complete = (request: RestoreRequest) => Promise<unknown>
export type RestoreOptions = PromptOptions & { complete: Complete }
export type IpsumResult = { keysmash: string; text: string }

/** keysmash の各文を LLM に 1 回で読み解かせる */
export const restore = async (
  sentences: readonly Sentence[],
  opts: RestoreOptions
): Promise<string[]> => {
  if (sentences.length === 0) return []
  const output = await opts.complete(buildRequest(sentences, opts))
  return parseRestored(output, sentences, opts)
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
