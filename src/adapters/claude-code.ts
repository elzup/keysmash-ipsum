import { tmpdir } from 'node:os'
import type { Complete } from '../restore.ts'
import { runCommand } from './run.ts'

// haiku はランダムな英字の並びを安全分類器に誤判定されて断られることがある ([bio] を実測)。
// sonnet + effort low なら 100 語で 5〜10 秒・2.5k token 前後で、断られなかった (D-0012)
export const CLAUDE_DEFAULT_MODEL = 'sonnet'
// 綴りの近い語を当てるだけなので深く考えさせる必要がない。思考の token と待ち時間を削る
const EFFORT = 'low'

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
  '--effort',
  EFFORT,
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

const REFUSAL = /can't help with this|usage policy|aup/i

const parseJson = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout)
  } catch {
    throw new Error(
      `claude -p の出力が JSON ではありません: ${stdout.trim().slice(0, 500)}`
    )
  }
}

const readStructured = (stdout: string): unknown => {
  const result = parseJson(stdout) as {
    is_error?: boolean
    result?: string
    structured_output?: unknown
  }
  if (result.is_error === true) {
    const message = result.result ?? ''
    // ランダムな英字の長い並びは安全分類器に誤判定されることがある (haiku 5.5 で [bio] を実測)
    const hint = REFUSAL.test(message)
      ? '\n安全分類器に断られました。語数を減らすか、--model sonnet などで試してください'
      : ''
    throw new Error(`claude -p がエラーを返しました: ${message}${hint}`)
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
        shouldReadStdoutOnFailure: true,
      }
    )
    return readStructured(stdout)
  }
