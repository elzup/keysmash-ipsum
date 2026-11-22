/**
 * npm の `keysmash-ipsum` コマンド本体。引数の解釈と表示だけを持ち、生成・読み解きは words / restore に任せる。
 *   keysmash-ipsum [words|sentences] [<count>] [--lang en|ja] [--seed <s>] [--layout qwerty|uniform]
 *                  [--llm claude|codex] [--model <name>] [--raw] [--json-detail] [-h]
 *   words (既定):  count 個のバラバラな単語を空白区切りで出す
 *   sentences:     count 個の文を 1 段落で出す
 */
import { parseArgs } from 'node:util'
import { CLAUDE_DEFAULT_MODEL } from './adapters/claude-code.ts'
import { createComplete, LLM_NAMES, type LlmName } from './adapters/index.ts'
import { oneOf, parseCount } from './cli-args.ts'
import { generate, type Lang, resolveOptions } from './generate.ts'
import { type Complete, restore, restoreWords } from './restore.ts'
import { generateWords } from './words.ts'

export { runGen } from './gen-cli.ts'

const MODES = ['words', 'sentences'] as const
type Mode = (typeof MODES)[number]

/**
 * 1 回の LLM 呼び出しに載せる上限。schema は語ごとに必須キーが増え、出力も 1 語あたり数 token 増えるので、
 * 段落 2〜3 個ぶんで止める (多すぎると出力上限・時間切れ・安全分類器の誤判定に当たりやすい)。
 * sentences は 1 文最大 9 語なので 20 文で 180 語
 */
const LIMITS: Record<Mode, { default: number; max: number; unit: string }> = {
  words: { default: 8, max: 200, unit: 'words' },
  sentences: { default: 3, max: 20, unit: 'sentences' },
}

export type CliDeps = {
  /** 読み解きに使う LLM。省略時は --llm で選んだ CLI の adapter */
  complete?: (name: LlmName, model?: string) => Complete
  /** LLM を待つ前に呼ぶ。1 回 10〜60 秒黙るので、bin は端末にだけ進捗を出す */
  notify?: (message: string) => void
}
export type CliDetail = { seed: string; text: string; mid: string }

const HELP = `Usage: keysmash-ipsum [words|sentences] [count] [options]

Dummy text from keysmash: generates seeded random typos and restores them
with a CLI you are logged in to (structured output).

Commands:
  words [n]               n separate words (default; n default ${LIMITS.words.default}, max ${LIMITS.words.max})
  sentences [n]           n sentences as one paragraph (n default ${LIMITS.sentences.default}, max ${LIMITS.sentences.max})

Options:
  --count <n>             same as [n]
  --lang en|ja            language (default en)
  --seed <s>              same seed -> same keysmash (default: current time)
  --layout qwerty|uniform keysmash style (default qwerty)
  --llm claude|codex      CLI used to restore (default claude)
  --model <name>          model passed to the CLI (claude: ${CLAUDE_DEFAULT_MODEL}, codex: its default)
  --raw                   print the keysmash without calling the LLM
  --json-detail           print { seed, text, mid } as JSON (mid = keysmash)
  -h, --help              show this help

Examples:
  keysmash-ipsum 6
  keysmash-ipsum sentences 2 --lang ja
  keysmash-ipsum words 12 --json-detail
  keysmash-ipsum --raw --seed s1 30
`

/** 先頭の位置引数がモード名ならモードとして取り、残りを語数・文数の候補として返す */
const splitPositionals = (
  positionals: string[]
): { mode: Mode; rest: string[] } => {
  const [first, ...rest] = positionals
  const mode = MODES.find((name) => name === first)
  return mode === undefined
    ? { mode: 'words', rest: positionals }
    : { mode, rest }
}

const readCount = (
  mode: Mode,
  rest: string[],
  option: string | undefined
): number => {
  // `lang ja` のように -- を付け忘れた引数を黙って捨てないため、count 以外の位置引数は弾く
  const extra = option === undefined ? rest.slice(1) : rest
  if (extra.length > 0) {
    throw new Error(
      `不明な引数: ${extra.join(' ')} (オプションは --lang ja のように -- を付けてください。-h で使い方)`
    )
  }
  const limit = LIMITS[mode]
  const count = parseCount(option ?? rest[0], 'count') ?? limit.default
  if (count > limit.max) {
    throw new Error(`${mode} の count は ${limit.max} 以下: ${count}`)
  }
  return count
}

type Keysmash = {
  mid: string
  restore: (complete: Complete) => Promise<string>
}

/** モードごとに keysmash を作り、読み解き方を束ねる。ja の文は間に空白を入れない */
const prepare = (
  mode: Mode,
  count: number,
  seed: string,
  lang: Lang,
  layout: 'qwerty' | 'uniform' | undefined
): Keysmash => {
  if (mode === 'words') {
    const words = generateWords({ seed, count, lang, layout })
    return {
      mid: words.map((word) => word.text).join(' '),
      restore: async (complete) =>
        (await restoreWords(words, { lang, complete })).join(' '),
    }
  }
  const sentences = generate({ seed, count, lang, layout })
  const joint = lang === 'ja' ? '' : ' '
  return {
    mid: sentences.map((sentence) => sentence.text).join(joint),
    restore: async (complete) =>
      (await restore(sentences, { lang, complete })).join(joint),
  }
}

export const runCli = async (
  argv: string[],
  deps: CliDeps = {}
): Promise<string> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      count: { type: 'string' },
      lang: { type: 'string' },
      seed: { type: 'string' },
      layout: { type: 'string' },
      llm: { type: 'string', default: 'claude' },
      model: { type: 'string' },
      raw: { type: 'boolean', default: false },
      'json-detail': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return HELP
  const { mode, rest } = splitPositionals(positionals)
  const count = readCount(mode, rest, values.count)
  // seed 省略時の時刻 seed を --json-detail で出すため、先に確定させる
  const { seed, lang } = resolveOptions({
    seed: values.seed,
    lang: oneOf(values.lang, ['en', 'ja'], 'lang'),
  })
  const layout = oneOf(values.layout, ['qwerty', 'uniform'], 'layout')
  const keysmash = prepare(mode, count, seed, lang, layout)
  const llm = oneOf(values.llm, LLM_NAMES, 'llm') ?? 'claude'
  if (!values.raw) {
    const model = values.model === undefined ? '' : ` (${values.model})`
    deps.notify?.(
      `restoring ${count} ${LIMITS[mode].unit} with ${llm}${model}...`
    )
  }
  const pickComplete = deps.complete ?? createComplete
  const text = values.raw
    ? keysmash.mid
    : await keysmash.restore(pickComplete(llm, values.model))
  if (!values['json-detail']) return `${text}\n`
  const detail: CliDetail = { seed, text, mid: keysmash.mid }
  return `${JSON.stringify(detail)}\n`
}
