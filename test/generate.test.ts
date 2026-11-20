import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generate } from '../src/index.ts'

const texts = (opts: Parameters<typeof generate>[0]): string[] =>
  generate(opts).map((sentence) => sentence.text)

describe('generate', () => {
  it('同じ seed なら同じ文字列になる', () => {
    assert.deepEqual(
      texts({ seed: 'a', count: 5 }),
      texts({ seed: 'a', count: 5 })
    )
    assert.notDeepEqual(
      texts({ seed: 'a', count: 5 }),
      texts({ seed: 'b', count: 5 })
    )
  })

  // skill 版 (agent-setup の gen.ts) と同じ乱数消費順であることの固定。崩れると既存 seed の再現が壊れる
  it('既知の seed の出力を再現する', () => {
    assert.deepEqual(texts({ seed: 's1', count: 2 }), [
      'ft dsxc gvdw sew swmnm hju ftgz hny.',
      'fv fbmjmr aqwev jyjhmnjn.',
    ])
    assert.deepEqual(texts({ seed: 's1', lang: 'ja' }), [
      'よてす きしょうら してうくと ういから るんに、つずのに くおことの かのっな。',
    ])
  })

  it('1 語のときは文末記号を付けない', () => {
    const words = texts({ seed: 'w', count: 20, words: { min: 1, max: 1 } })
    assert.ok(words.every((word) => !/[.。\s]/.test(word)))
  })

  it('ja は句読点を全角にし、かなだけで構成する', () => {
    const lines = texts({ seed: 'j', count: 20, lang: 'ja' })
    assert.ok(lines.every((line) => line.endsWith('。')))
    assert.ok(lines.every((line) => /^[ぁ-ゖー、。 ]+$/.test(line)))
  })

  it('語数は words の範囲に収まる', () => {
    const sentences = generate({
      seed: 'r',
      count: 30,
      words: { min: 2, max: 3 },
    })
    assert.ok(
      sentences.every((s) => s.words.length >= 2 && s.words.length <= 3)
    )
  })

  it('不正な範囲や件数は throw する', () => {
    assert.throws(() => generate({ words: { min: 9, max: 2 } }), /words/)
    assert.throws(() => generate({ wordLen: { min: 0, max: 2 } }), /wordLen/)
    assert.throws(() => generate({ count: 0 }), /count/)
    assert.throws(() => generate({ seps: '' }), /seps/)
  })
})
