# keysmash-ipsum

> Dummy text from keysmash. Seeded random typos (English / mistyped hiragana) are restored into sentences by any LLM you plug in.

```
ft dsxc gvdw sew swmnm hju ftgz hny.       → At discos gods sew swimsuits, huge frogs hum.
のちゃが てさひさく がもが いしまぷれ。      → 残りが手作りで誰もがいたします。
```

lorem ipsum より意味があり、faker より予想外の文章になる。

- **生成 (`generate`)** は seed から決定的。LLM もネットワークも使わない。
- **読み解き (`restore`)** は LLM を 1 回だけ呼ぶ。LLM は関数 1 つ (`complete`) で差し込むので、provider・API キー・リトライは呼び出し側が持つ。

## Install

```
$ npm install keysmash-ipsum
```

## Usage

### 生成だけ (LLM なし)

```ts
import { generate } from 'keysmash-ipsum'

generate({ seed: 's1', count: 2 }).map((s) => s.text)
// ['ft dsxc gvdw sew swmnm hju ftgz hny.', 'fv fbmjmr aqwev jyjhmnjn.']

generate({ seed: 'w', lang: 'ja', words: { min: 1, max: 1 } })[0].text
// 'いだれにがん'  (1 語なら文末記号なし)
```

| option | default | |
|---|---|---|
| `seed` | 現在時刻 | 同じ seed → 同じ文字列 |
| `count` | `1` | 文の数 |
| `words` | `{ min: 4, max: 9 }` | 1 文の語数 |
| `wordLen` | en `2-8` / ja `2-5` | 1 語の長さ (ja は助詞を除いたかなの数) |
| `layout` | `'qwerty'` | en: 隣接キーの手癖 / `'uniform'` は a–z 均等。ja: 頻度表 / `'uniform'` はかな均等 |
| `lang` | `'en'` | `'ja'` はひらがなを直接生成し、段・行・濁点のずれ、っ/ん の挿入、抜けを混ぜる |
| `seps` | `' ,'` | 区切り候補。先頭が 85% |

各 `Sentence` は `words[].trace` に中間データ (en: `·` 隣接 / `|` ジャンプ、ja: ずらす前のかなとずれ方) を持つ。

### LLM で文章にする

```ts
import Anthropic from '@anthropic-ai/sdk'
import { type Complete, keysmashIpsum } from 'keysmash-ipsum'

const client = new Anthropic() // ANTHROPIC_API_KEY を読む
const complete: Complete = async (prompt) => {
  const res = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

await keysmashIpsum({ lang: 'ja', count: 3, complete })
// [{ keysmash: 'のちゃが てさひさく …', text: '残りが手作りで…' }, …]
```

- 全文を 1 回の呼び出しで送る。入力は数百 token、出力は 1 文あたり十数 token なので小さいモデルで足りる。
- `complete` はどの LLM でもよい (OpenAI、Ollama などのローカル LLM、テスト用の偽関数)。
- プロンプトだけ欲しいときは `buildPrompt(lines, { lang })`、返答の解析は `parseRestored(output, n)` (行数が合わなければ throw)。

## Agent skill

`skills/keysmash-ipsum/` は Claude Code などの agent 用 skill。agent 自身が読み解き役になるので、API キーは要らない。CLI は `src` を `.ts` のまま import するので、clone すればビルドなしで動く。

```
$ node skills/keysmash-ipsum/scripts/gen.ts --seed s1 --lang ja --trace
```

## License

MIT © [anozon](https://anozon.me)
