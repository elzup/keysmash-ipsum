import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRequest,
  buildSchema,
  type Complete,
  generate,
  keysmashIpsum,
  parseRestored,
  RestoreMismatchError,
  restore,
} from '../src/index.ts'
import { fakeComplete } from './fake-llm.ts'

const twoSentences = generate({
  seed: 's1',
  count: 2,
  words: { min: 3, max: 3 },
})

describe('buildSchema', () => {
  it('strict は文と語を必須プロパティで固定する', () => {
    const schema = buildSchema(twoSentences) as {
      required: string[]
      additionalProperties: boolean
      properties: Record<
        string,
        { required: string[]; additionalProperties: boolean }
      >
    }
    assert.deepEqual(schema.required, ['s1', 's2'])
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(schema.properties.s1?.required, ['w1', 'w2', 'w3'])
    assert.equal(schema.properties.s1?.additionalProperties, false)
  })

  it('配列の長さ制約 (未対応の機能) を使わない', () => {
    const json = JSON.stringify(buildSchema(twoSentences))
    assert.doesNotMatch(json, /minItems|maxItems|minLength|maxLength/)
  })

  it('strict: false は 1 文 → 1 文字列', () => {
    const schema = buildSchema(twoSentences, { strict: false }) as {
      properties: Record<string, { type: string }>
    }
    assert.equal(schema.properties.s1?.type, 'string')
  })
})

describe('buildRequest', () => {
  it('入力の各語をキー付きで並べる', () => {
    const { prompt, system } = buildRequest(twoSentences)
    const first = twoSentences[0]
    assert.ok(first)
    assert.ok(prompt.split('\n').includes(`s1: ${first.text}`))
    assert.ok(prompt.includes(`w1=${first.words[0]?.text} `))
    assert.match(system, /JSON schema/)
  })

  it('ja はかな漢字を指示する', () => {
    assert.match(
      buildRequest(twoSentences, { lang: 'ja' }).prompt,
      /kana-kanji/
    )
  })
})

describe('parseRestored', () => {
  it('元の区切りと文末記号を戻す', () => {
    const [sentence] = generate({
      seed: 'p',
      words: { min: 2, max: 2 },
      seps: ',',
    })
    assert.ok(sentence)
    const out = parseRestored({ s1: { w1: 'Hello', w2: 'world' } }, [sentence])
    assert.deepEqual(out, ['Hello,world.'])
  })

  it('ja は空白を消して句読点だけ残す', () => {
    const [sentence] = generate({
      seed: 'p',
      lang: 'ja',
      words: { min: 2, max: 2 },
      seps: ' ',
    })
    assert.ok(sentence)
    const out = parseRestored(
      { s1: { w1: '今日は', w2: '晴れ' } },
      [sentence],
      { lang: 'ja' }
    )
    assert.deepEqual(out, ['今日は晴れ。'])
  })

  it('語に付いた句読点や空白は剥がす', () => {
    const [sentence] = generate({
      seed: 'p',
      words: { min: 2, max: 2 },
      seps: ' ',
    })
    assert.ok(sentence)
    const out = parseRestored({ s1: { w1: ' Hello,', w2: 'world.' } }, [
      sentence,
    ])
    assert.deepEqual(out, ['Hello world.'])
  })

  it('キー欠け・空文字・型違いは throw する', () => {
    const one = twoSentences.slice(0, 1)
    assert.throws(() => parseRestored({}, one), /s1/)
    assert.throws(
      () => parseRestored({ s1: { w1: 'a', w2: 'b' } }, one),
      /s1\.w3/
    )
    assert.throws(
      () => parseRestored({ s1: { w1: 'a', w2: '', w3: 'c' } }, one),
      /s1\.w2/
    )
    assert.throws(
      () => parseRestored({ s1: { w1: 'a', w2: 1, w3: 'c' } }, one),
      /s1\.w2/
    )
    assert.throws(() => parseRestored('text', one), /root/)
  })
})

describe('restore / keysmashIpsum', () => {
  it('空なら LLM を呼ばない', async () => {
    const out = await restore([], {
      complete: async () => {
        throw new Error('呼ばれてはいけない')
      },
    })
    assert.deepEqual(out, [])
  })

  it('schema を LLM に渡し、結果を文ごとに返す', async () => {
    const results = await keysmashIpsum({
      seed: 's1',
      count: 2,
      words: { min: 3, max: 3 },
      complete: fakeComplete,
    })
    assert.equal(results.length, 2)
    assert.equal(results[0]?.keysmash, twoSentences[0]?.text)
    assert.match(results[0]?.text ?? '', /^W1.w2.+w3\.$/)
  })
})

describe('restore のやり直し', () => {
  it('型どおりでなければ 1 回だけやり直す', async () => {
    const calls: number[] = []
    const flaky: Complete = async (request) => {
      calls.push(1)
      return calls.length === 1 ? {} : fakeComplete(request)
    }
    const out = await restore(twoSentences, { complete: flaky })
    assert.equal(calls.length, 2)
    assert.equal(out.length, 2)
  })

  it('2 回続いたら RestoreMismatchError で throw する', async () => {
    const calls: number[] = []
    const broken: Complete = async () => {
      calls.push(1)
      return {}
    }
    await assert.rejects(
      restore(twoSentences, { complete: broken }),
      RestoreMismatchError
    )
    assert.equal(calls.length, 2)
  })

  it('provider のエラーはやり直さない', async () => {
    const calls: number[] = []
    const failing: Complete = async () => {
      calls.push(1)
      throw new Error('rate limited')
    }
    await assert.rejects(restore(twoSentences, { complete: failing }), /rate/)
    assert.equal(calls.length, 1)
  })
})
