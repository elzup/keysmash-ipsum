/** CLI (runCli / runGen) が共通で使う引数の解釈 */
import type { Range } from './rng.ts'

export const parseRange = (
  raw: string | undefined,
  name: string
): Range | undefined => {
  if (raw === undefined) return undefined
  const match = /^(\d+)(?:-(\d+))?$/.exec(raw)
  if (match === null) {
    throw new Error(
      `--${name} は "4" か "4-9" の形式で指定してください: ${raw}`
    )
  }
  const min = Number(match[1])
  return { min, max: match[2] === undefined ? min : Number(match[2]) }
}

export const parseCount = (
  raw: string | undefined,
  name: string
): number | undefined => {
  if (raw === undefined) return undefined
  const count = Number(raw)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`${name} は 1 以上の整数: ${raw}`)
  }
  return count
}

export const oneOf = <T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  name: string
): T | undefined => {
  if (raw === undefined) return undefined
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`--${name} は ${allowed.join('|')}: ${raw}`)
  }
  return raw as T
}
