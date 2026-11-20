import { type GenerateOptions, generate } from './generate.ts'
import { buildPrompt, type PromptOptions, parseRestored } from './prompt.ts'

/** プロンプトを受けて LLM の返答テキストを返す関数。provider・キー・リトライは呼び出し側が持つ */
export type Complete = (prompt: string) => Promise<string>
export type RestoreOptions = PromptOptions & { complete: Complete }
export type IpsumResult = { keysmash: string; text: string }

/** keysmash の各行を LLM に 1 回で読み解かせる */
export const restore = async (
  lines: readonly string[],
  opts: RestoreOptions
): Promise<string[]> => {
  if (lines.length === 0) return []
  const output = await opts.complete(buildPrompt(lines, opts))
  return parseRestored(output, lines.length)
}

/** generate → restore をまとめて行う */
export const keysmashIpsum = async (
  opts: GenerateOptions & RestoreOptions
): Promise<IpsumResult[]> => {
  const keysmashes = generate(opts).map((sentence) => sentence.text)
  const texts = await restore(keysmashes, opts)
  return keysmashes.map((keysmash, i) => ({ keysmash, text: texts[i] ?? '' }))
}
