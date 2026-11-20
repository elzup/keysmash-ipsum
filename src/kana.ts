/**
 * ja モード: ひらがなを直接生成し、かなの上で打ち間違いを混ぜる。
 *
 * ローマ字経由だと英字のずれがかなに戻らない塊 (`rejha`) になるため、ずれは五十音表の上で起こす。
 * 読み解くのは LLM なので、並びは「日本語っぽい」程度で足りる。頻度表は外部データを使わず手書きの概算。
 */
import type { Word } from './en.ts'
import { pick, type Rng } from './rng.ts'

// 五十音表 (行 × a i u e o 段)。`・` は存在しないマス
const GRID = [
  'あいうえお',
  'かきくけこ',
  'さしすせそ',
  'たちつてと',
  'なにぬねの',
  'はひふへほ',
  'まみむめも',
  'や・ゆ・よ',
  'らりるれろ',
  'わ・・・を',
  'がぎぐげご',
  'ざじずぜぞ',
  'だぢづでど',
  'ばびぶべぼ',
  'ぱぴぷぺぽ',
]
const VOICED_FAMILIES = [
  'かが',
  'きぎ',
  'くぐ',
  'けげ',
  'こご',
  'さざ',
  'しじ',
  'すず',
  'せぜ',
  'そぞ',
  'ただ',
  'ちぢ',
  'つづ',
  'てで',
  'とど',
  'はばぱ',
  'ひびぴ',
  'ふぶぷ',
  'へべぺ',
  'ほぼぽ',
]

// 一般的な日本語文でのおおよその出現比 (概算・手書き)。単語の頭に来ない文字は NOT_INITIAL で弾く
// biome-ignore format: 頻度順の表は横に並べたほうが読める
const KANA_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['い', 50], ['う', 38], ['ん', 36], ['し', 34], ['か', 32], ['の', 32], ['と', 30], ['た', 30], ['て', 28],
  ['く', 26], ['な', 26], ['に', 26], ['き', 22], ['る', 22], ['こ', 20], ['ま', 20], ['っ', 18], ['す', 18],
  ['ら', 16], ['は', 16], ['お', 16], ['が', 16], ['り', 14], ['で', 14], ['れ', 14], ['つ', 12], ['さ', 12],
  ['あ', 12], ['も', 12], ['け', 10], ['だ', 10], ['え', 10], ['よ', 9], ['せ', 9], ['ち', 8], ['じ', 8],
  ['そ', 8], ['わ', 8], ['め', 7], ['み', 7], ['ろ', 6], ['ど', 6], ['や', 6], ['ご', 6], ['ひ', 5], ['ほ', 5],
  ['ば', 4], ['ふ', 4], ['げ', 4], ['ず', 4], ['ね', 4], ['ぶ', 3], ['び', 3], ['ゆ', 3], ['む', 3], ['べ', 3],
  ['ぎ', 2], ['ぐ', 2], ['ぼ', 2], ['ぜ', 2], ['へ', 2], ['ざ', 2], ['ぞ', 2], ['ぱ', 1], ['ぽ', 1], ['ぴ', 1],
  ['ぷ', 1], ['ぺ', 1], ['ぬ', 1],
]
// 1 文字ずつだと拗音や定番の語尾が出ないので、よく出る並びを塊で混ぜる
const CHUNKS = [
  'した',
  'して',
  'ている',
  'です',
  'ます',
  'こと',
  'もの',
  'から',
  'ので',
  'けど',
  'ような',
  'しょう',
  'きょう',
  'じゅう',
  'ちゃ',
  'ません',
  'られ',
  'だった',
  'ところ',
  'という',
]
const PARTICLES = [
  'は',
  'が',
  'を',
  'に',
  'で',
  'の',
  'と',
  'も',
  'へ',
  'から',
  'まで',
]
const NOT_INITIAL = 'んっー'
const EMPTY_CELL = '・'
const FALLBACK_INITIAL = 'あ'

// 塊を選ぶ確率。上げると語尾の定型句ばかりになる
const CHUNK_RATE = 0.2
// 文節の末尾に助詞を付ける確率。付けると LLM が文節の切れ目と品詞を推測しやすい
const PARTICLE_RATE = 0.4
// 1 かなあたりのずれる確率。0.25 (旧ローマ字版) では元の語が読めなくなったので下げた
const KANA_TYPO_RATE = 0.1
// 頭文字の引き直し上限。重み付き抽選なので数回で抜けるが、無限ループの保険
const MAX_REDRAW = 10

const TOTAL_WEIGHT = KANA_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)

const pickWeighted = (rng: Rng): string => {
  const target = rng() * TOTAL_WEIGHT
  const found = KANA_WEIGHTS.reduce<{ acc: number; kana: string | null }>(
    (state, [kana, w]) => {
      if (state.kana !== null) return state
      return state.acc + w > target
        ? { acc: state.acc, kana }
        : { acc: state.acc + w, kana: null }
    },
    { acc: 0, kana: null }
  )
  return found.kana ?? FALLBACK_INITIAL
}

const pickToken = (rng: Rng, isUniform: boolean): string => {
  if (isUniform) return pick(rng, KANA_WEIGHTS)[0]
  return rng() < CHUNK_RATE ? pick(rng, CHUNKS) : pickWeighted(rng)
}

const pickInitial = (rng: Rng, isUniform: boolean): string => {
  const draws = Array.from({ length: MAX_REDRAW }, () =>
    pickToken(rng, isUniform)
  )
  return (
    draws.find((token) => !NOT_INITIAL.includes(token[0] ?? '')) ??
    FALLBACK_INITIAL
  )
}

const locate = (kana: string): { row: string; col: number } | null => {
  const row = GRID.find((r) => r.includes(kana))
  return row === undefined ? null : { row, col: row.indexOf(kana) }
}

type Typo = { out: string; note: string }

/** 同じ行で段がずれる (か → き)。母音キーの打ち間違い */
const shiftDan = (rng: Rng, kana: string): Typo | null => {
  const pos = locate(kana)
  if (pos === null) return null
  const options = [...pos.row].filter(
    (k, i) => k !== EMPTY_CELL && i !== pos.col
  )
  return options.length === 0 ? null : { out: pick(rng, options), note: '段' }
}

/** 同じ段で行がずれる (か → さ)。子音キーの打ち間違い */
const shiftGyo = (rng: Rng, kana: string): Typo | null => {
  const pos = locate(kana)
  if (pos === null) return null
  const options = GRID.map((r) => r[pos.col]).filter(
    (k): k is string => k !== undefined && k !== EMPTY_CELL && k !== kana
  )
  return { out: pick(rng, options), note: '行' }
}

/** 濁点・半濁点の付け外し (か ⇄ が、は → ぱ) */
const toggleVoice = (rng: Rng, kana: string): Typo | null => {
  const family = VOICED_FAMILIES.find((f) => f.includes(kana))
  if (family === undefined) return null
  return {
    out: pick(
      rng,
      [...family].filter((k) => k !== kana)
    ),
    note: '濁',
  }
}

/** っ / ん の打ち過ぎ */
const insertExtra = (rng: Rng, kana: string): Typo => ({
  out: kana + pick(rng, ['っ', 'ん']),
  note: '挿',
})
const dropKana = (): Typo => ({ out: '', note: '抜' })

const TYPO_OPS = [
  shiftDan,
  shiftGyo,
  toggleVoice,
  insertExtra,
  dropKana,
] as const

const typoKana = (rng: Rng, kana: string, canDrop: boolean): Typo | null => {
  if (rng() >= KANA_TYPO_RATE) return null
  const op = pick(rng, TYPO_OPS)
  if (op === dropKana && !canDrop) return null
  return op(rng, kana) ?? shiftDan(rng, kana)
}

/** 1 文節ぶんのひらがなを作り、かなの上でずらす。trace は `元 → ずれた結果 (種類)` */
export const smashWordKana = (
  rng: Rng,
  len: number,
  isUniform: boolean
): Word => {
  const stem = Array.from({ length: len - 1 }).reduce<string>(
    (word) => (word.length >= len ? word : word + pickToken(rng, isUniform)),
    pickInitial(rng, isUniform)
  )
  const original = rng() < PARTICLE_RATE ? stem + pick(rng, PARTICLES) : stem
  const chars = [...original]
  const typed = chars.map((kana) => ({
    kana,
    typo: typoKana(rng, kana, chars.length > 1),
  }))
  const text = typed.map(({ kana, typo }) => typo?.out ?? kana).join('')
  const notes = typed.flatMap(({ kana, typo }) =>
    typo === null ? [] : [`${kana}→${typo.out || '∅'}(${typo.note})`]
  )
  return {
    text,
    trace: notes.length === 0 ? original : `${original}  ${notes.join(' ')}`,
  }
}
