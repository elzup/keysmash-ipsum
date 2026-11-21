import { tmpdir } from 'node:os'
import type { Complete } from '../restore.ts'
import { runCommand } from './run.ts'

// 読み解きは短文の推測だけなので、速くて安い haiku で足りる
export const CLAUDE_DEFAULT_MODEL = 'haiku'

/**
 * 読み解き専用に隔離した `claude -p` の引数。プロンプトは stdin で渡す。
 * --bare は OAuth (subscription) を読まなくなるので使えない。代わりに system prompt を差し替え、
 * ツール・MCP・設定ファイル (CLAUDE.md や hooks) を切り、セッションも保存しない。
 * --json-schema は引数でしか受け取れないが、中身はライブラリが作る固定の形 (キーと型だけ)
 */
const buildArgs = (
  model: string,
  system: string,
  schema: unknown
): string[] => [
  '-p',
  '--model',
  model,
  '--output-format',
  'json',
  '--json-schema',
  JSON.stringify(schema),
  '--system-prompt',
  system,
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  '',
  '--no-session-persistence',
]

const readStructured = (stdout: string): unknown => {
  const result = JSON.parse(stdout) as {
    is_error?: boolean
    result?: string
    structured_output?: unknown
  }
  if (result.is_error === true) {
    throw new Error(`claude -p がエラーを返しました: ${result.result ?? ''}`)
  }
  if (result.structured_output === undefined) {
    throw new Error('claude -p の出力に structured_output がありません')
  }
  return result.structured_output
}

/**
 * 手元の Claude Code (`claude -p --json-schema`) を LLM として使う Complete。
 * 認証は Claude Code のログイン (subscription) をそのまま使い、トークンには触れない
 */
export const claudeCodeComplete =
  (model: string = CLAUDE_DEFAULT_MODEL): Complete =>
  async ({ system, prompt, schema }) => {
    // プロジェクトの CLAUDE.md を拾わないよう、cwd を一時ディレクトリにする
    const stdout = await runCommand(
      'claude',
      buildArgs(model, system, schema),
      {
        input: prompt,
        cwd: tmpdir(),
      }
    )
    return readStructured(stdout)
  }
