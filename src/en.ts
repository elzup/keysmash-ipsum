import { pickChar, type Rng } from './rng.ts'

export type Layout = 'qwerty' | 'uniform'
export type Word = { text: string; trace: string }

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const HOME_ROW = 'asdfghjkl'

// 隣のキーへ流れる確率。1 に近いと「asdfjkl」のような手癖の塊になり、0 だと uniform と変わらない。
// 0.6 は推測の手がかり (それっぽさ) と意外性の釣り合いで選んだ
const ADJACENT_RATE = 0.6

const neighborsOf = (ch: string): string => {
  const rowIndex = QWERTY_ROWS.findIndex((row) => row.includes(ch))
  const row = QWERTY_ROWS[rowIndex]
  if (row === undefined) return ALPHABET
  const col = row.indexOf(ch)
  const sameRow = [col - 1, col + 1].map((c) => row[c])
  const otherRows = [rowIndex - 1, rowIndex + 1].flatMap((r) =>
    [col - 1, col, col + 1].map((c) => QWERTY_ROWS[r]?.[c])
  )
  return [...sameRow, ...otherRows]
    .filter((c): c is string => c !== undefined)
    .join('')
}

/**
 * qwerty: ホーム列から始め、隣のキーへ流れやすいランダムウォーク (本物の keysmash の手癖)。
 * trace は `·` = 隣のキーへ流れた、`|` = ランダムにジャンプした
 */
export const smashWordEn = (rng: Rng, len: number, layout: Layout): Word => {
  if (layout === 'uniform') {
    const text = Array.from({ length: len }, () =>
      pickChar(rng, ALPHABET)
    ).join('')
    return { text, trace: 'uniform' }
  }
  const first = pickChar(rng, HOME_ROW)
  return Array.from({ length: len - 1 }).reduce<Word>(
    (word) => {
      const prev = word.text.at(-1) ?? first
      const isAdjacent = rng() < ADJACENT_RATE
      const next = isAdjacent
        ? pickChar(rng, neighborsOf(prev))
        : pickChar(rng, ALPHABET)
      return {
        text: word.text + next,
        trace: word.trace + (isAdjacent ? '·' : '|') + next,
      }
    },
    { text: first, trace: first }
  )
}
