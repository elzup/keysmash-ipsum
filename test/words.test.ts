import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildWordsRequest,
  buildWordsSchema,
  type Complete,
  generateWords,
  parseWords,
  RestoreMismatchError,
  restoreWords,
} from '../src/index.ts'
import { fakeComplete } from './fake-llm.ts'

const words = generateWords({ seed: 's1', count: 3 })

describe('generateWords', () => {
  it('count 個の語を seed から決定的に作る', () => {
    assert.equal(words.length, 3)
    assert.deepEqual(generateWords({ seed: 's1', count: 3 }), words)
    assert.ok(words.every((word) => /^[a-z]+$/.test(word.text)))
  })

  it('ja はひらがなの語', () => {
    const kana = generateWords({ seed: 's1', count: 4, lang: 'ja' })
    assert.equal(kana.length, 4)
    assert.ok(kana.every((word) => !/[、。 ]/.test(word.text)))
  })
})

describe('buildWordsSchema / buildWordsRequest', () => {
  it('語 w1.. を必須キーで固定する', () => {
    const schema = buildWordsSchema(words) as {
      required: string[]
      additionalProperties: boolean
    }
    assert.deepEqual(schema.required, ['w1', 'w2', 'w3'])
    assert.equal(schema.additionalProperties, false)
  })

  it('各語を独立に読ませ、文にさせない', () => {
    const { prompt } = buildWordsRequest(words)
    assert.ok(prompt.split('\n').includes(`w1: ${words[0]?.text}`))
    assert.match(prompt, /Do not connect them into a sentence/)
  })
})

describe('parseWords / restoreWords', () => {
  it('キー欠け・空文字は RestoreMismatchError', () => {
    assert.throws(
      () => parseWords({ w1: 'a', w2: 'b' }, words),
      RestoreMismatchError
    )
    assert.throws(() => parseWords({ w1: 'a', w2: '', w3: 'c' }, words), /w2/)
  })

  it('語ごとに返し、句読点や空白は剥がす', async () => {
    assert.deepEqual(
      parseWords({ w1: ' cat,', w2: 'dog.', w3: 'sun' }, words),
      ['cat', 'dog', 'sun']
    )
    assert.deepEqual(await restoreWords(words, { complete: fakeComplete }), [
      'w1',
      'w2',
      'w3',
    ])
  })

  it('型どおりでなければ 1 回だけやり直す', async () => {
    const calls: number[] = []
    const flaky: Complete = async (request) => {
      calls.push(1)
      return calls.length === 1 ? {} : fakeComplete(request)
    }
    assert.equal((await restoreWords(words, { complete: flaky })).length, 3)
    assert.equal(calls.length, 2)
  })
})
