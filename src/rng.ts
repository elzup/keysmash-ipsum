export type Rng = () => number
export type Range = { min: number; max: number }

/** 文字列 seed を 32bit に畳む (FNV-1a)。数値でも単語でも seed にできるようにするため */
const hashSeed = (seed: string): number =>
  [...seed].reduce(
    (h, ch) => Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0,
    0x811c9dc5
  )

/** mulberry32: 依存ゼロで十分な品質の決定的 PRNG */
export const createRng = (seed: string): Rng => {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  const item = items[Math.floor(rng() * items.length)]
  if (item === undefined) throw new Error('pick: items が空です')
  return item
}

export const pickChar = (rng: Rng, chars: string): string =>
  pick(rng, [...chars])

export const between = (rng: Rng, range: Range): number =>
  range.min + Math.floor(rng() * (range.max - range.min + 1))
