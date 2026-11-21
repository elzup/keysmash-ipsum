import type { Complete, JsonSchema } from '../src/index.ts'

/**
 * schema のとおりに埋める偽 LLM。文字列の葉にはキー名 (w1, s1 …) を入れる。
 * en の strict では先頭語の大文字化を LLM がやる想定なので、s*.w1 だけ大文字で返す
 */
const fill = (schema: JsonSchema, key: string, parent: string): unknown => {
  if (schema.type === 'string') {
    return parent.startsWith('s') && key === 'w1' ? 'W1' : key
  }
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  return Object.fromEntries(
    Object.entries(properties).map(([child, sub]) => [
      child,
      fill(sub, child, key),
    ])
  )
}

export const fakeComplete: Complete = async ({ schema }) =>
  fill(schema, 'root', '')
