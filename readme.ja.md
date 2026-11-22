# keysmash-ipsum

[English](./readme.md) | 日本語

> keysmash からダミーテキストを作る。seed 付きの乱数で作った打ち間違い (英字 / 打ち間違えたひらがな) を、LLM が structured output で本物の単語や文に読み解く。

```
$ keysmash-ipsum 10
as fix huh jail hazard seasons groups ads flights fly

$ keysmash-ipsum sentences 3
So the very last person standing. This book changed it, the student said. Everyone can go to england before morning.
```

lorem ipsum より意味があり、faker より予想外の言葉になる。

- **生成**は seed から決定的。LLM もネットワークも使わない。
- **読み解き**は LLM を structured output で 1 回呼ぶ。schema は keysmash の語ごとに必須キーを持つので、語数は「お願い」ではなく構造で保証される。
- LLM は関数 1 つで差し込むので、provider・API キー・リトライは呼び出し側が持つ。CLI はログイン済みの CLI (Claude Code か Codex) を使うので、API キーは要らない。

## Install

```
$ npm install keysmash-ipsum
```

## CLI

```
keysmash-ipsum [words|sentences] [count] [options]
```

| コマンド | 出力 |
|---|---|
| `words [n]` (既定) | `n` 個のバラバラな単語。空白区切りで句読点なし。1 語ずつ独立に読み解き、文にはしない |
| `sentences [n]` | `n` 個の文を 1 段落で |

```
$ keysmash-ipsum 10 --lang ja
けど がぞくた 理由 元気 まっすぐに いい ねえける いはがると 街 にゃちゃと

$ keysmash-ipsum words 6 --seed s1 --json-detail
{"seed":"s1","text":"…","mid":"ft dsxc gvdw sew swmnm hju"}
```

| option | 既定 | |
|---|---|---|
| `[n]` / `--count` | words `8` (上限 `200`) / sentences `3` (上限 `20`) | 語数 / 文の数 |
| `--lang` | `en` | `en` / `ja` |
| `--seed` | 現在時刻 | 同じ seed → 同じ keysmash |
| `--layout` | `qwerty` | `qwerty` (隣接キーの手癖) / `uniform` |
| `--llm` | `claude` | `claude` (`claude -p --json-schema`) / `codex` (`codex exec --output-schema`) |
| `--model` | claude: `sonnet` / codex: codex の既定 | CLI に渡すモデル |
| `--raw` | off | LLM を呼ばず keysmash のまま出す |
| `--json-detail` | off | `{ seed, text, mid }` を JSON で出す (`mid` は keysmash) |
| `-h`, `--help` | | 使い方を出す |

- keysmash は決定的だが、読み解いた結果は決定的ではない (LLM の答えは毎回変わる)。
- プロンプトは stdin で渡し、shell は通さない。Claude Code はツール・MCP サーバ・設定ファイル (CLAUDE.md、hooks) を切って動かす。
- Codex は `~/.codex/AGENTS.md` を読み込んでしまう (止める引数が無い)。出力は schema で縛っている。

### コスト

1 回あたりの実測 (2026-11-22、Claude Code 2.1.330 の `sonnet` + `--effort low`、codex-cli 0.171.0)。token は入力 + 出力で、各 CLI 自身の上乗せ分を含む。

| コマンド | claude の token | claude (API 換算) | claude の時間 | codex の token | codex の時間 |
|---|---|---|---|---|---|
| `words 8` | 約 1.7k | $0.008 | 7 秒 | 約 38k | 19 秒 |
| `words 100` | 約 6.1k | $0.039 | 16 秒 | 約 40k | 25 秒 |
| `sentences 3` | 約 2.2k | $0.010 | 7 秒 | | |
| `sentences 20` | 約 7.5k | $0.038 | 12 秒 | | |

- subscription ではプランの使用量を消費する。会話全体を毎ターン読み直すコーディングエージェントの 1 ターンと比べると小さい。
- claude の入力のうち約 1.2k token は Claude Code 自身の土台。Codex は約 3 万 token が固定でかかる (system prompt と `AGENTS.md`)。
- ライブラリから API を直接呼ぶ場合 (下記) は、この上乗せ分がかからない。

## ライブラリ

### 生成だけ (LLM なし)

```ts
import { generate, generateWords } from 'keysmash-ipsum'

generateWords({ seed: 's1', count: 3 }).map((w) => w.text)
// ['ft', 'dsxc', 'gvdw']

generate({ seed: 's1', count: 2 }).map((s) => s.text)
// ['ft dsxc gvdw sew swmnm hju ftgz hny.', 'fv fbmjmr aqwev jyjhmnjn.']
```

| option | 既定 | |
|---|---|---|
| `seed` | 現在時刻 | 同じ seed → 同じ文字列 |
| `count` | `1` | 語数 (`generateWords`) / 文の数 (`generate`) |
| `words` | `{ min: 4, max: 9 }` | 1 文の語数 (`generate` のみ) |
| `wordLen` | en `2-8` / ja `2-5` | 1 語の長さ (ja は助詞を除いたかなの数) |
| `layout` | `'qwerty'` | en: 隣接キーの手癖 / `'uniform'` は a–z 均等。ja: 頻度表 / `'uniform'` はかな均等 |
| `lang` | `'en'` | `'ja'` はひらがなを直接生成し、段・行・濁点のずれ、っ/ん の挿入、抜けを混ぜる |
| `seps` | `' ,'` | 区切り候補 (`generate` のみ)。先頭が 85% |

各 `Word` は `trace` に中間データ (en: `·` 隣接 / `|` ジャンプ、ja: ずらす前のかなとずれ方) を持つ。

### LLM で読み解く

```ts
import Anthropic from '@anthropic-ai/sdk'
import { type Complete, generateWords, restoreWords } from 'keysmash-ipsum'

const client = new Anthropic() // ANTHROPIC_API_KEY を読む
const complete: Complete = async ({ system, prompt, schema }) => {
  const res = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema } },
  })
  const block = res.content.find((b) => b.type === 'text')
  return JSON.parse(block?.type === 'text' ? block.text : 'null')
}

const words = generateWords({ count: 5 })
await restoreWords(words, { complete }) // ['as', 'fix', 'huh', 'jail', 'hazard']
```

- **structured output 必須。** `complete` は `{ system, prompt, schema }` を受け取り、`schema` を provider の structured output (Anthropic の `output_config.format`、OpenAI の `response_format` json_schema など) に渡して、パース済みの JSON を返す。
- **形は schema で保証する。** `restoreWords` は語ごと (`w1`, `w2`, …)、`restore` (文) は文と語ごと (`s1.w1`, …) に必須キーを持つ。Anthropic の structured output は配列の長さ制約に対応していないので使わない。
- **結果はもう一度検証する。** キー欠け・空文字・型違い (拒否や出力の打ち切りで起こりうる) は `RestoreMismatchError` で throw する。その前に 1 回だけやり直す。provider のエラーはやり直さない。
- 句読点・区切り・英語の文頭の大文字は LLM に任せず、入力から戻す。
- `keysmashIpsum({ count, lang, complete })` は `generate` + `restore` を 1 回で行う。下位の部品は `buildWordsRequest` / `parseWords`、`buildRequest` / `parseRestored`。`strict: false` で `restore` に意訳を許す (1 文 → 1 文字列)。

## Agent skill

`skills/keysmash-ipsum/` は Claude Code などの agent 用 skill。agent 自身が読み解き役になるので、API キーは要らない。skill の CLI は `src` を `.ts` のまま import するので、clone すればビルドなしで動く。

```
$ node skills/keysmash-ipsum/scripts/gen.ts --seed s1 --lang ja --trace
```

## License

MIT © [anozon](https://anozon.me)
