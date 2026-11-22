/**
 * skill の gen.ts 用。agent が自分で読み解くので LLM は呼ばず、ヘッダー付きで keysmash を出す
 *   gen.ts [--seed <s>] [--count <sentences>] [--words <min-max>] [--word-len <min-max>]
 *          [--layout qwerty|uniform] [--lang en|ja] [--seps <chars>] [--trace]
 *   出力: 1 行目 `# seed=<s> lang=<lang>`、以降 1 行 1 文
 */
import { parseArgs } from 'node:util'
import { oneOf, parseCount, parseRange } from './cli-args.ts'
import {
  type GenerateOptions,
  generate,
  resolveOptions,
  type Sentence,
} from './generate.ts'

// trace の桁揃え用。かなは端末で 2 桁ぶん取るので文字数ではなく表示幅で数える
const FULLWIDTH_FROM = 0x3000

const displayWidth = (text: string): number =>
  [...text].reduce(
    (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= FULLWIDTH_FROM ? 2 : 1),
    0
  )

const formatTrace = (sentence: Sentence): string[] => {
  const width = Math.max(
    ...sentence.words.map((word) => displayWidth(word.text))
  )
  return sentence.words.map(
    (word) =>
      `  ${word.text}${' '.repeat(width - displayWidth(word.text))}  ${word.trace}`
  )
}

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
  // seed 省略時の時刻 seed をヘッダーにも出すため、先に確定させてから generate に渡す
  const resolved = resolveOptions(opts)
  const body = generate(resolved).flatMap((sentence) =>
    values.trace ? [sentence.text, ...formatTrace(sentence)] : [sentence.text]
  )
  const header = `# seed=${resolved.seed} lang=${resolved.lang}`
  return `${[header, ...body].join('\n')}\n`
}
