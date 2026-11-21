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

describe('runCli', () => {
  it('指定した語数で読み解いた文章だけを出す', async () => {
    const out = await runCli(['--seed', 's1', '2'], {
      complete: recordingFactory([]),
    })
    assert.equal(out, 'W1 w2.\n')
  })

  it('--json-detail で seed / text / mid を JSON で出し、--model を渡す', async () => {
    const models: string[] = []
    const out = await runCli(
      ['--seed', 's1', '--count', '3', '--json-detail', '--model', 'sonnet'],
      { complete: recordingFactory(models) }
    )
    const detail = JSON.parse(out)
    assert.deepEqual(models, ['claude:sonnet'])
    assert.equal(detail.seed, 's1')
    assert.equal(detail.text, 'W1 w2 w3.')
    assert.equal(detail.mid.split(' ').length, 3)
  })

  it('--llm codex を選べる', async () => {
    const models: string[] = []
    await runCli(['--seed', 's1', '--llm', 'codex', '2'], {
      complete: recordingFactory(models),
    })
    assert.deepEqual(models, ['codex:-'])
    await assert.rejects(runCli(['--llm', 'kimi', '2']), /--llm/)
  })

  it('--raw では LLM を呼ばず keysmash を出す', async () => {
    const models: string[] = []
    const out = await runCli(['--seed', 's1', '--raw', '2'], {
      complete: recordingFactory(models),
    })
    assert.deepEqual(models, [])
    assert.match(out, /^\S+ \S+\.\n$/)
  })

  it('不正な語数は throw する', async () => {
    await assert.rejects(runCli(['--count', '0']), /count/)
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
