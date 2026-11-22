import { spawn } from 'node:child_process'

// claude / codex は 1 回 15〜60 秒かかる。固まった CLI を待ち続けないための上限
const TIMEOUT_MS = 5 * 60 * 1000

export type RunOptions = {
  /** stdin に流す内容。プロンプトは引数でなくここで渡す (フラグとの取り違え・引数長の上限を避ける) */
  input: string
  cwd: string
  /** true: 終了コードが 0 以外でも stdout を返す (エラー内容を stdout の JSON に出す CLI 用) */
  shouldReadStdoutOnFailure?: boolean
}

/**
 * コマンドを shell を通さずに実行し stdout を返す。
 * 引数は配列のまま渡るので、`;` や `$()` は解釈されない。Windows の .cmd は shell が要るので対応しない
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  opts: RunOptions
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      shell: false,
      timeout: TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', (error: NodeJS.ErrnoException) => {
      const reason =
        error.code === 'ENOENT'
          ? `${command} コマンドが見つかりません (インストールしてログインしてください)`
          : `${command} を起動できませんでした: ${error.message}`
      reject(new Error(reason))
    })
    child.on('close', (code, signal) => {
      if (code === 0 || opts.shouldReadStdoutOnFailure === true) {
        resolve(Buffer.concat(stdout).toString('utf8'))
        return
      }
      // claude --output-format json はエラーも stdout の JSON に出すので、stderr が空なら stdout を見せる
      const detail =
        Buffer.concat(stderr).toString('utf8').trim() ||
        Buffer.concat(stdout).toString('utf8').trim()
      const status = signal === null ? `exit ${code}` : `signal ${signal}`
      reject(new Error(`${command} が失敗しました (${status}): ${detail}`))
    })
    child.stdin.end(opts.input)
  })
