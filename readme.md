# keysmash-ipsum

English | [日本語](./readme.ja.md)

> Dummy text from keysmash. Seeded random typos (English / mistyped hiragana) are restored into real words or sentences by an LLM, through structured output.

```
$ keysmash-ipsum 10
as fix huh jail hazard seasons groups ads flights fly

$ keysmash-ipsum sentences 3
So the very last person standing. This book changed it, the student said. Everyone can go to england before morning.
```

More meaningful than lorem ipsum, more surprising than faker.

- **Generation** is deterministic from a seed. No LLM, no network.
- **Restoration** calls the LLM once, with structured output. The schema has one required key per keysmash word, so the word count is guaranteed by structure, not by asking nicely.
- The LLM is plugged in as a single function, so the provider, API key and retries stay on your side. The CLI uses a CLI you are already logged in to (Claude Code or Codex), so it needs no API key.

## Install

```
$ npm install keysmash-ipsum
```

No dependencies. The package is 28.0 kB (114.1 kB unpacked). Importing it into a bundle costs (measured with `pnpm size`, esbuild minify + gzip):

| import | minified | min + gzip |
|---|---|---|
| everything (`import *`) | 9.9 kB | 4.2 kB |
| `generate` + `generateWords` only | 6.0 kB | 2.5 kB |

## CLI

```
keysmash-ipsum [words|sentences] [count] [options]
```

| command | output |
|---|---|
| `words [n]` (default) | `n` separate words, space-separated, no punctuation. Each word is restored on its own, not as a sentence |
| `sentences [n]` | `n` sentences as one paragraph |

```
$ keysmash-ipsum 10 --lang ja --llm codex
売っている サムネイル ポテト 知能テスト イラスト版 ケータリング 切ります ますます 見れても 手跡

$ keysmash-ipsum words 6 --seed s1 --json-detail
{"seed":"s1","text":"…","mid":"ft dsxc gvdw sew swmnm hju"}
```

| option | default | |
|---|---|---|
| `[n]` / `--count` | words `8` (max `200`) / sentences `3` (max `20`) | number of words / sentences |
| `--lang` | `en` | `en` / `ja` |
| `--seed` | current time | same seed → same keysmash |
| `--layout` | `qwerty` | `qwerty` (adjacent-key habits) / `uniform` |
| `--llm` | `claude` | `claude` (`claude -p --json-schema`) / `codex` (`codex exec --output-schema`) |
| `--model` | claude: `sonnet` / codex: its default | model passed to the CLI |
| `--raw` | off | print the keysmash without calling the LLM |
| `--json-detail` | off | print `{ seed, text, mid }` as JSON (`mid` is the keysmash) |
| `-h`, `--help` | | show usage |

- The keysmash is deterministic; the restored text is not (the LLM answers differently each time).
- The prompt is passed on stdin and nothing goes through a shell. Claude Code runs with its tools, MCP servers and settings files (CLAUDE.md, hooks) turned off.
- Codex still reads `~/.codex/AGENTS.md`; there is no flag to turn it off. The output is constrained by the schema anyway.

### Cost

One call, measured on 2026-11-22 (Claude Code 2.1.330 with `sonnet` + `--effort low`, codex-cli 0.171.0). Tokens are input + output, including each CLI's own overhead.

| command | claude tokens | claude (API-equivalent) | claude time | codex tokens | codex time |
|---|---|---|---|---|---|
| `words 8` | ~1.7k | $0.008 | 7 s | ~38k | 19 s |
| `words 100` | ~6.1k | $0.039 | 16 s | ~40k | 25 s |
| `sentences 3` | ~2.2k | $0.010 | 7 s | | |
| `sentences 20` | ~7.5k | $0.038 | 12 s | | |

- On a subscription this counts toward your plan's usage. One call is small next to a coding-agent turn, which re-reads the whole conversation.
- About 1.2k input tokens of each claude call are Claude Code's own scaffolding. Codex has a fixed ~30k (its system prompt plus `AGENTS.md`).
- Calling the API directly from the library (below) skips that overhead.

## Library

### Generate only (no LLM)

```ts
import { generate, generateWords } from 'keysmash-ipsum'

generateWords({ seed: 's1', count: 3 }).map((w) => w.text)
// ['ft', 'dsxc', 'gvdw']

generate({ seed: 's1', count: 2 }).map((s) => s.text)
// ['ft dsxc gvdw sew swmnm hju ftgz hny.', 'fv fbmjmr aqwev jyjhmnjn.']
```

| option | default | |
|---|---|---|
| `seed` | current time | same seed → same string |
| `count` | `1` | words (`generateWords`) / sentences (`generate`) |
| `words` | `{ min: 4, max: 9 }` | words per sentence (`generate` only) |
| `wordLen` | en `2-8` / ja `2-5` | word length (for ja: number of kana, excluding particles) |
| `layout` | `'qwerty'` | en: adjacent-key habits / `'uniform'` picks a–z evenly. ja: frequency table / `'uniform'` picks kana evenly |
| `lang` | `'en'` | `'ja'` generates hiragana directly, mixing in vowel-row / consonant-column / dakuten slips, inserted っ/ん, and dropped kana |
| `seps` | `' ,'` | separator candidates (`generate` only). The first one is used 85% of the time |

Each `Word` carries intermediate data in `trace` (en: `·` adjacent / `|` jump, ja: the kana before the slip and how it slipped).

### Restore with an LLM

```ts
import Anthropic from '@anthropic-ai/sdk'
import { type Complete, generateWords, restoreWords } from 'keysmash-ipsum'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
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

- **Structured output is required.** `complete` receives `{ system, prompt, schema }`, must pass `schema` to the provider's structured output (Anthropic `output_config.format`, OpenAI `response_format` json_schema, …) and return the parsed JSON.
- **The schema guarantees the shape.** `restoreWords` uses one required key per word (`w1`, `w2`, …); `restore` (sentences) uses one per sentence and word (`s1.w1`, …). Array length limits are not used, since Anthropic structured output does not support them.
- **The result is validated again.** A missing, empty or mistyped key (possible on a refusal or a cut-off output) throws `RestoreMismatchError`; the call is retried once first. Provider errors are not retried.
- Punctuation, separators and the capital at the start of an English sentence are restored from the input, not left to the LLM.
- `keysmashIpsum({ count, lang, complete })` does `generate` + `restore` in one go. Lower-level pieces: `buildWordsRequest` / `parseWords`, `buildRequest` / `parseRestored`. `strict: false` lets `restore` paraphrase freely (one string per sentence).

## Agent skill

`skills/keysmash-ipsum/` is a skill for agents such as Claude Code. The agent itself does the restoring, so no API key is needed. Its CLI imports `src` as `.ts` directly, so it runs from a clone without a build.

```
$ node skills/keysmash-ipsum/scripts/gen.ts --seed s1 --lang ja --trace
```

## License

MIT © [elzup](https://elzup.com)
