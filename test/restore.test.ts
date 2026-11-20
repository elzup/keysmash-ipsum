import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPrompt,
  type Complete,
  keysmashIpsum,
  parseRestored,
  restore,
} from '../src/index.ts'

/** 受け取ったプロンプトの番号付き行を数え、その数だけ `<n>: guess <n>` を返す偽 LLM */
const fakeComplete: Complete = async (prompt) =>
  prompt
    .split('\n')
    .filter((line) => /^\d+: /.test(line))
    .map((_, i) => `${i + 1}: guess ${i + 1}`)
    .join('\n')

describe('buildPrompt', () => {
  it('入力を番号付きで並べ、行数を指示する', () => {
    const prompt = buildPrompt(['aa bb.', 'cc dd.'])
    assert.match(prompt, /^1: aa bb\.$/m)
    assert.match(prompt, /^2: cc dd\.$/m)
    assert.match(prompt, /exactly 2 line/)
  })

  it('ja はかな漢字と空白除去を指示する', () => {
    assert.match(
      buildPrompt(['あい'], { lang: 'ja' }),
      /hiragana.*remove spaces/
    )
  })

  it('strict: false で意訳を許す', () => {
    assert.match(buildPrompt(['x'], { strict: false }), /paraphrase/)
  })
})

describe('parseRestored', () => {
  it('番号を剥がし空行を捨てる', () => {
    assert.deepEqual(parseRestored('1: Hello.\n\n2) World.\n', 2), [
      'Hello.',
      'World.',
    ])
  })

  it('行数が合わなければ throw する', () => {
    assert.throws(() => parseRestored('1: only one', 2), /期待 2 行/)
  })
})

describe('restore / keysmashIpsum', () => {
  it('complete を 1 回だけ呼び、行ごとに返す', async () => {
    const calls: string[] = []
    const complete: Complete = async (prompt) => {
      calls.push(prompt)
      return fakeComplete(prompt)
    }
    assert.deepEqual(await restore(['a.', 'b.'], { complete }), [
      'guess 1',
      'guess 2',
    ])
    assert.equal(calls.length, 1)
  })

  it('空配列なら complete を呼ばない', async () => {
    const complete: Complete = async () => {
      throw new Error('呼ばれてはいけない')
    }
    assert.deepEqual(await restore([], { complete }), [])
  })

  it('keysmash と推測結果を対にして返す', async () => {
    const results = await keysmashIpsum({
      seed: 's1',
      count: 2,
      complete: fakeComplete,
    })
    assert.deepEqual(results, [
      { keysmash: 'ft dsxc gvdw sew swmnm hju ftgz hny.', text: 'guess 1' },
      { keysmash: 'fv fbmjmr aqwev jyjhmnjn.', text: 'guess 2' },
    ])
  })
})
