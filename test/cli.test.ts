import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runCli, runGen } from '../src/cli.ts'
import type { Complete } from '../src/index.ts'
import { fakeComplete } from './fake-llm.ts'

/** fakeComplete を返し、渡された llm / model を記録する */
const recordingFactory =
  (models: string[]) =>
  (name: string, model?: string): Complete => {
    models.push(`${name}:${model ?? '-'}`)
    return fakeComplete
  }

describe('runCli words (既定)', () => {
  it('サブコマンド無しは words。語を句読点なしの空白区切りで出す', async () => {
    const deps = { complete: recordingFactory([]) }
    assert.equal(await runCli(['--seed', 's1', '3'], deps), 'w1 w2 w3\n')
    assert.equal(await runCli(['words', '--seed', 's1', '2'], deps), 'w1 w2\n')
  })

  it('--json-detail で seed / text / mid を出し、--model を渡す', async () => {
    const models: string[] = []
    const out = await runCli(
      ['--seed', 's1', '--count', '3', '--json-detail', '--model', 'sonnet'],
      { complete: recordingFactory(models) }
    )
    const detail = JSON.parse(out)
    assert.deepEqual(models, ['claude:sonnet'])
    assert.equal(detail.seed, 's1')
    assert.equal(detail.text, 'w1 w2 w3')
    assert.match(detail.mid, /^\S+ \S+ \S+$/)
  })

  it('上限を超える語数は throw する', async () => {
    await assert.rejects(runCli(['--count', '0']), /count/)
    await assert.rejects(runCli(['--raw', '201']), /words の count は 200 以下/)
  })
})

describe('runCli sentences', () => {
  it('count 個の文を 1 段落で出す', async () => {
    const out = await runCli(['sentences', '--seed', 's1', '2'], {
      complete: recordingFactory([]),
    })
    const ends = out.match(/\./g) ?? []
    assert.equal(ends.length, 2)
    assert.match(out, /^W1 /)
  })

  it('ja は文の間に空白を入れない', async () => {
    const out = await runCli([
      'sentences',
      '--raw',
      '--lang',
      'ja',
      '--seed',
      's1',
      '2',
    ])
    assert.equal(out.trimEnd().split('。').length, 3)
    assert.doesNotMatch(out, /。 /)
  })

  it('上限を超える文数は throw する', async () => {
    await assert.rejects(
      runCli(['sentences', '--raw', '21']),
      /sentences の count は 20 以下/
    )
  })
})

describe('runCli 共通', () => {
  it('--llm codex を選べ、未対応の llm は throw する', async () => {
    const models: string[] = []
    await runCli(['--seed', 's1', '--llm', 'codex', '2'], {
      complete: recordingFactory(models),
    })
    assert.deepEqual(models, ['codex:-'])
    await assert.rejects(runCli(['--llm', 'kimi', '2']), /--llm/)
  })

  it('-- を付け忘れた引数は黙って捨てずに throw する', async () => {
    await assert.rejects(
      runCli(['lang', 'ja', '--count', '1']),
      /不明な引数: lang ja/
    )
    await assert.rejects(runCli(['3', 'ja']), /不明な引数: ja/)
    await assert.rejects(runCli(['sentences', '2', 'ja']), /不明な引数: ja/)
    await assert.rejects(runCli(['lang']), /count/)
  })

  it('-h / --help で使い方を出し、LLM を呼ばない', async () => {
    const models: string[] = []
    for (const flag of ['-h', '--help']) {
      const out = await runCli([flag], { complete: recordingFactory(models) })
      assert.match(out, /^Usage: keysmash-ipsum \[words\|sentences\]/)
    }
    assert.deepEqual(models, [])
  })

  it('LLM を待つ前に notify し、--raw では notify しない', async () => {
    const messages: string[] = []
    const notify = (m: string) => messages.push(m)
    const deps = { complete: recordingFactory([]), notify }
    await runCli(['--seed', 's1', '4'], deps)
    await runCli(['sentences', '--seed', 's1', '2'], deps)
    await runCli(['--raw', '4'], { notify })
    assert.deepEqual(messages, [
      'restoring 4 words with claude...',
      'restoring 2 sentences with claude...',
    ])
  })

  it('--raw では LLM を呼ばず keysmash を出す', async () => {
    const models: string[] = []
    const out = await runCli(['--seed', 's1', '--raw', '2'], {
      complete: recordingFactory(models),
    })
    assert.deepEqual(models, [])
    assert.match(out, /^\S+ \S+\n$/)
  })
})

describe('runGen', () => {
  it('ヘッダーと 1 行 1 文を出す', () => {
    const lines = runGen(['--seed', 's1', '--count', '2']).trimEnd().split('\n')
    assert.equal(lines[0], '# seed=s1 lang=en')
    assert.equal(lines.length, 3)
  })

  it('不正な範囲は throw する', () => {
    assert.throws(() => runGen(['--words', 'x']), /--words/)
  })
})
