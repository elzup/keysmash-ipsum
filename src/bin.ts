#!/usr/bin/env node
import { runCli } from './cli.ts'

// 端末のときだけ待ち中の 1 行を出し、終わったら消す (パイプ先の出力は汚さない)
const isTty = process.stderr.isTTY === true
const CLEAR_LINE = '\r\x1b[K'
const notify = (message: string): void => {
  if (isTty) process.stderr.write(message)
}
const clear = (): void => {
  if (isTty) process.stderr.write(CLEAR_LINE)
}

// top-level await は CJS ビルドで使えないので then でつなぐ
runCli(process.argv.slice(2), { notify }).then(
  (out) => {
    clear()
    process.stdout.write(out)
  },
  (error: unknown) => {
    clear()
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
