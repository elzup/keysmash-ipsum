import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Complete } from '../restore.ts'
import { runCommand } from './run.ts'

/**
 * 読み解き専用に絞った `codex exec` の引数。プロンプトは stdin (`-`)、schema と出力はファイルで渡すので、
 * 引数に入るのはフラグと一時ファイルのパスだけ。
 * ~/.codex/AGENTS.md だけは止める手段が無い (CODEX_HOME の差し替えは認証の更新を壊しうるので使わない)。
 * 出力は schema と parseRestored の検証で縛る
 */
const buildArgs = (dir: string, model: string | undefined): string[] => [
  'exec',
  '--ignore-user-config',
  '--ignore-rules',
  '--ephemeral',
  '--skip-git-repo-check',
  '--sandbox',
  'read-only',
  '--cd',
  dir,
  '--output-schema',
  join(dir, 'schema.json'),
  '--output-last-message',
  join(dir, 'out.json'),
  ...(model === undefined ? [] : ['--model', model]),
  '-',
]

/**
 * 手元の Codex CLI (`codex exec --output-schema`) を LLM として使う Complete。
 * 認証は Codex のログイン (ChatGPT subscription) をそのまま使い、トークンには触れない。
 * model 省略時は Codex の既定モデル
 */
export const codexComplete =
  (model?: string): Complete =>
  async ({ system, prompt, schema }) => {
    const dir = await mkdtemp(join(tmpdir(), 'keysmash-ipsum-'))
    try {
      await writeFile(join(dir, 'schema.json'), JSON.stringify(schema))
      // codex exec には system prompt を差し替える引数が無いので、指示の先頭に置く
      await runCommand('codex', buildArgs(dir, model), {
        input: `${system}\n\n${prompt}`,
        cwd: dir,
      })
      return JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
