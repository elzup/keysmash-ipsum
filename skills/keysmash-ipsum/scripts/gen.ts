#!/usr/bin/env node
/**
 * skill 用の CLI。中身はパッケージの src/cli.ts の runGen (agent が自分で読み解くので LLM は呼ばない)。
 * src を .ts のまま import するので、ビルドも install も不要 (node v22.6+ の type stripping)。
 * 引数は src/cli.ts の冒頭コメントを参照。
 */
import { runGen } from '../../../src/cli.ts'

try {
  process.stdout.write(runGen(process.argv.slice(2)))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
