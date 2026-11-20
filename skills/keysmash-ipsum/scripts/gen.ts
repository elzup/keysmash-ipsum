#!/usr/bin/env node
/**
 * skill 用の CLI。生成ロジックの正本はパッケージの src (ここは引数の解釈と表示だけ)。
 * src を .ts のまま import するので、ビルドも install も不要 (node v22.6+ の type stripping)。
 *
 *   node gen.ts [--seed <s>] [--count <n>] [--words <min-max>] [--word-len <min-max>]
 *               [--layout qwerty|uniform] [--lang en|ja] [--seps <chars>] [--trace]
 *
 *   出力: 1 行目 `# seed=<s> lang=<lang>`、以降 1 行 1 文の keysmash 文字列
 *   --trace: 各文の下に 1 語ずつ中間データ (en: `·` 隣接 / `|` ジャンプ、ja: ずらす前のかなとずれ方)
 */
import { parseArgs } from 'node:util'
import {
  type GenerateOptions,
  generate,
  type Range,
  resolveOptions,
  type Sentence,
} from '../../../src/index.ts'

// trace の桁揃え用。かなは端末で 2 桁ぶん取るので文字数ではなく表示幅で数える
const FULLWIDTH_FROM = 0x3000

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

const parseOptions = (
  argv: string[]
): { opts: GenerateOptions; isTrace: boolean } => {
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
    count: values.count === undefined ? undefined : Number(values.count),
    words: parseRange(values.words, 'words'),
    wordLen: parseRange(values['word-len'], 'word-len'),
    layout: oneOf(values.layout, ['qwerty', 'uniform'], 'layout'),
    lang: oneOf(values.lang, ['en', 'ja'], 'lang'),
    seps: values.seps,
  }
  return { opts, isTrace: values.trace }
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

const main = (): void => {
  const { opts, isTrace } = parseOptions(process.argv.slice(2))
  // seed 省略時の時刻 seed をヘッダーにも出すため、先に確定させてから generate に渡す
  const resolved = resolveOptions(opts)
  const sentences = generate(resolved)
  const body = sentences.flatMap((sentence) =>
    isTrace ? [sentence.text, ...formatTrace(sentence)] : [sentence.text]
  )
  const header = `# seed=${resolved.seed} lang=${resolved.lang}`
  process.stdout.write(`${[header, ...body].join('\n')}\n`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
