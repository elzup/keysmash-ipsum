# keysmash-ipsum

[English](./readme.md) | 日本語

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
const complete: Complete = async ({ system, prompt, schema }) => {
  const res = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema } },
  })
  const block = res.content.find((b) => b.type === 'text')
  return JSON.parse(block?.type === 'text' ? block.text : 'null')
}

await keysmashIpsum({ lang: 'ja', count: 3, complete })
// [{ keysmash: 'のちゃが てさひさく …', text: '残りが手作りで…' }, …]
```

- **structured output 必須。** `complete` は `{ system, prompt, schema }` を受け取り、`schema` を provider の structured output (Anthropic の `output_config.format`、OpenAI の `response_format` json_schema など) に渡して、パース済みの JSON を返す。
- schema は文ごと (`s1`, `s2`, …)・keysmash の語ごと (`w1`, `w2`, …) にキーを固定するので、語数は構造で保証される。句読点と区切りは LLM に任せず入力から戻す。結果はもう一度検証し、キー欠け・空文字・型違いは throw する。
- 全文を 1 回の呼び出しで送る。入力は数百 token なので小さいモデルで足りる。
- 下位の部品: 依頼の組み立ては `buildRequest(sentences, { lang })`、結果の検証と組み立ては `parseRestored(output, sentences, { lang })`。`strict: false` で意訳を許す (1 文 → 1 文字列)。

## CLI

```
$ npx keysmash-ipsum 6
It does gave see some you.

$ npx keysmash-ipsum --seed s1 --json-detail 6
{"seed":"s1","text":"It does gave see some you.","mid":"ft dsxc gvdw sew swmnm hju."}
```

引数 (または `--count`) は語数。読み解きは、ログイン済みの CLI の structured output で行う: [Claude Code](https://claude.com/claude-code) (`claude -p --json-schema`、既定) か [Codex CLI](https://github.com/openai/codex) (`codex exec --output-schema`)。その CLI のログイン (subscription) をそのまま使うので API キーは要らないが、プランの使用量は消費する。1 回 15〜60 秒かかる。プロンプトは stdin で渡し、shell は通さない。

| option | default | |
|---|---|---|
| `<words>` / `--count` | `8` | 語数 |
| `--lang` | `en` | `en` / `ja` |
| `--seed` | 現在時刻 | 同じ seed → 同じ keysmash |
| `--layout` | `qwerty` | `qwerty` / `uniform` |
| `--llm` | `claude` | `claude` / `codex` |
| `--model` | claude: `haiku` / codex: 既定 | CLI に渡すモデル |
| `--raw` | off | LLM を呼ばず keysmash のまま出す |
| `--json-detail` | off | `{ seed, text, mid }` を JSON で出す (`mid` は keysmash) |

## Agent skill

`skills/keysmash-ipsum/` は Claude Code などの agent 用 skill。agent 自身が読み解き役になるので、API キーは要らない。CLI は `src` を `.ts` のまま import するので、clone すればビルドなしで動く。

```
$ node skills/keysmash-ipsum/scripts/gen.ts --seed s1 --lang ja --trace
```

## License

MIT © [anozon](https://anozon.me)
