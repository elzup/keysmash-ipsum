import type { Lang } from './generate.ts'

export type PromptOptions = {
  lang?: Lang
  /** true: 1 語 → 1 語 (ja は 1 文節) を守る。false: 意訳を許す */
  strict?: boolean
}

const LANG_NAME: Record<Lang, string> = { en: 'English', ja: 'Japanese' }
const LINE_PREFIX = /^\s*\d+\s*[:.)]\s*/

/**
 * keysmash を読み解かせるプロンプト。skill (agent が読む SKILL.md) と同じ規則を 1 か所にまとめる。
 * 出力は 1 行 1 文・番号付きで返させ、parseRestored で番号を剥がす (行の取り違えを検出するため)
 */
export const buildPrompt = (
  lines: readonly string[],
  opts: PromptOptions = {}
): string => {
  const lang = opts.lang ?? 'en'
  const rules = [
    `Each numbered line is a keysmash: someone tried to type a ${LANG_NAME[lang]} sentence and mistyped it. Guess the most plausible intended sentence.`,
    opts.strict === false
      ? '- Free paraphrase is allowed.'
      : `- Keep one output ${lang === 'ja' ? 'bunsetsu (文節)' : 'word'} per input word. Never drop a word, even if the guess is a stretch.`,
    '- Prefer spelling closeness (same or adjacent keys, similar length) first, then make it grammatical.',
    lang === 'ja'
      ? '- Input is mistyped hiragana. Output natural kana-kanji Japanese, use 、。 and remove spaces.'
      : '- Keep , and . as punctuation.',
    `- Output exactly ${lines.length} line(s) as "<number>: <sentence>", in order. No commentary.`,
  ]
  const input = lines.map((line, i) => `${i + 1}: ${line}`)
  return [...rules, '', ...input].join('\n')
}

/** LLM の出力から番号を剥がして行ごとに返す。行数が合わなければ throw (黙って欠けさせない) */
export const parseRestored = (output: string, expected: number): string[] => {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(LINE_PREFIX, ''))
  if (lines.length !== expected) {
    throw new Error(
      `LLM の出力が ${lines.length} 行でした (期待 ${expected} 行): ${output}`
    )
  }
  return lines
}
