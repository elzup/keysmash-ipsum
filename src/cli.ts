/**
 * CLI 本体。引数の解釈と表示だけを持ち、生成・読み解きは generate / restore に任せる。
 *
 * runCli (npm の `keysmash-ipsum` コマンド): 語数を指定して、読み解いた文章だけを出す
 *   keysmash-ipsum [<words>] [--count <words>] [--lang en|ja] [--seed <s>] [--layout qwerty|uniform]
 *                  [--llm claude|codex] [--model <name>] [--raw] [--json-detail]
 *   --llm:         読み解きに使う CLI (既定 claude)。--model はその CLI に渡す
 *   --raw:         LLM を呼ばず keysmash のまま出す
 *   --json-detail: `{ seed, text, mid }` を 1 行の JSON で出す (mid は読み解く前の keysmash)
 *
 * runGen (skill の gen.ts): agent が自分で読み解くための keysmash を出す
 *   gen.ts [--seed <s>] [--count <sentences>] [--words <min-max>] [--word-len <min-max>]
 *          [--layout qwerty|uniform] [--lang en|ja] [--seps <chars>] [--trace]
 *   出力: 1 行目 `# seed=<s> lang=<lang>`、以降 1 行 1 文
 */
import { parseArgs } from 'node:util'
import { createComplete, LLM_NAMES, type LlmName } from './adapters/index.ts'
import {
  type GenerateOptions,
  generate,
  type ResolvedOptions,
  resolveOptions,
  type Sentence,
} from './generate.ts'
import { type Complete, restore } from './restore.ts'
import type { Range } from './rng.ts'

// trace の桁揃え用。かなは端末で 2 桁ぶん取るので文字数ではなく表示幅で数える
const FULLWIDTH_FROM = 0x3000
// lorem ipsum の 1 文ぶん程度
const DEFAULT_WORD_COUNT = 8

export type CliDeps = {
  /** 読み解きに使う LLM。省略時は --llm で選んだ CLI の adapter */
  complete?: (name: LlmName, model?: string) => Complete
}
export type CliDetail = { seed: string; text: string; mid: string }

const displayWidth = (text: string): number =>
  [...text].reduce(
    (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= FULLWIDTH_FROM ? 2 : 1),
    0
  )

const parseRange = (
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

const parseCount = (
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

const oneOf = <T extends string>(
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

const header = (resolved: ResolvedOptions): string =>
  `# seed=${resolved.seed} lang=${resolved.lang}`

/** npm の `keysmash-ipsum` コマンド。指定した語数の 1 文を作り、読み解いた文章だけを stdout に出す */
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
    },
  })
  const count =
    parseCount(values.count ?? positionals[0], 'count') ?? DEFAULT_WORD_COUNT
  // seed 省略時の時刻 seed を --json-detail で出すため、先に確定させてから generate に渡す
  const resolved = resolveOptions({
    seed: values.seed,
    words: { min: count, max: count },
    layout: oneOf(values.layout, ['qwerty', 'uniform'], 'layout'),
    lang: oneOf(values.lang, ['en', 'ja'], 'lang'),
  })
  const sentences = generate(resolved)
  const mid = sentences.map((sentence) => sentence.text).join('\n')
  const llm = oneOf(values.llm, LLM_NAMES, 'llm') ?? 'claude'
  const pickComplete = deps.complete ?? createComplete
  const text = values.raw
    ? mid
    : (
        await restore(sentences, {
          lang: resolved.lang,
          complete: pickComplete(llm, values.model),
        })
      ).join('\n')
  if (!values['json-detail']) return `${text}\n`
  const detail: CliDetail = { seed: resolved.seed, text, mid }
  return `${JSON.stringify(detail)}\n`
}

const formatTrace = (sentence: Sentence): string[] => {
  const width = Math.max(
    ...sentence.words.map((word) => displayWidth(word.text))
  )
  return sentence.words.map(
    (word) =>
      `  ${word.text}${' '.repeat(width - displayWidth(word.text))}  ${word.trace}`
  )
}

/** skill 用。agent が自分で読み解くので LLM は呼ばず、ヘッダー付きで keysmash を出す */
export const runGen = (argv: string[]): string => {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'string' },
      count: { type: 'string' },
      words: { type: 'string' },
      'word-len': { type: 'string' },
      layout: { type: 'string' },
      lang: { type: 'string' },
      seps: { type: 'string' },
      trace: { type: 'boolean', default: false },
    },
  })
  const opts: GenerateOptions = {
    seed: values.seed,
    count: parseCount(values.count, '--count'),
    words: parseRange(values.words, 'words'),
    wordLen: parseRange(values['word-len'], 'word-len'),
    layout: oneOf(values.layout, ['qwerty', 'uniform'], 'layout'),
    lang: oneOf(values.lang, ['en', 'ja'], 'lang'),
    seps: values.seps,
  }
  const resolved = resolveOptions(opts)
  const body = generate(resolved).flatMap((sentence) =>
    values.trace ? [sentence.text, ...formatTrace(sentence)] : [sentence.text]
  )
  return `${[header(resolved), ...body].join('\n')}\n`
}
