import type { Lang } from './generate.ts'

/** structured output に渡す JSON Schema (Anthropic / OpenAI / claude -p の --json-schema にそのまま渡せる形) */
export type JsonSchema = { [key: string]: unknown }

export type RestoreRequest = {
  system: string
  prompt: string
  schema: JsonSchema
}

export type PromptOptions = {
  lang?: Lang
  /** sentences のみ。true: 1 語 → 1 語 (ja は 1 文節) を schema で固定する。false: 1 文 → 1 文字列で意訳を許す */
  strict?: boolean
}

/** LLM の出力が schema どおりでない (キー欠け・空文字・型違い)。restore はこのときだけやり直す */
export class RestoreMismatchError extends Error {
  override name = 'RestoreMismatchError'
}

export const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  ja: 'Japanese',
}

export const SYSTEM =
  'You restore keysmash (mistyped text) into what the typist most plausibly intended. Answer only through the given JSON schema.'

// LLM が語に句読点や空白を付けてきても、区切りは元の keysmash から組み直すので剥がしてよい
const EDGE_PUNCT = /^[\s.,、。]+|[\s.,、。]+$/g

export const sentenceKey = (i: number): string => `s${i + 1}`
export const wordKey = (i: number): string => `w${i + 1}`

/**
 * 必須キーを並べた object schema。配列の長さ制約 (minItems 等) は Anthropic の structured output が
 * 対応していないので、個数はキーの数で構造として保証する (D-0010)
 */
export const objectSchema = (
  keys: string[],
  value: (i: number) => JsonSchema
): JsonSchema => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((key, i) => [key, value(i)])),
  required: keys,
  additionalProperties: false,
})

export const STRING_SCHEMA: JsonSchema = { type: 'string' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const readObject = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new RestoreMismatchError(
      `LLM の出力の ${path} がオブジェクトではありません`
    )
  }
  return value
}

export const readString = (value: unknown, path: string): string => {
  const text = typeof value === 'string' ? value.replace(EDGE_PUNCT, '') : ''
  if (text.length === 0) {
    throw new RestoreMismatchError(
      `LLM の出力の ${path} が空か文字列ではありません`
    )
  }
  return text
}
