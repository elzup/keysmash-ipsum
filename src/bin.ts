#!/usr/bin/env node
import { runCli } from './cli.ts'

// top-level await は CJS ビルドで使えないので then でつなぐ
runCli(process.argv.slice(2)).then(
  (out) => process.stdout.write(out),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
