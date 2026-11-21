# keysmash-ipsum

English | [日本語](./readme.ja.md)

> Dummy text from keysmash. Seeded random typos (English / mistyped hiragana) are restored into sentences by any LLM you plug in.

```
ft dsxc gvdw sew swmnm hju ftgz hny.       → At discos gods sew swimsuits, huge frogs hum.
のちゃが てさひさく がもが いしまぷれ。      → 残りが手作りで誰もがいたします。
```

More meaningful than lorem ipsum, more surprising than faker.

- **Generation (`generate`)** is deterministic from a seed. No LLM, no network.
- **Restoration (`restore`)** calls the LLM exactly once. The LLM is plugged in as a single function (`complete`), so the provider, API key and retries stay on the caller's side.

## Install

```
$ npm install keysmash-ipsum
```

## Usage

### Generate only (no LLM)

```ts
import { generate } from 'keysmash-ipsum'

generate({ seed: 's1', count: 2 }).map((s) => s.text)
// ['ft dsxc gvdw sew swmnm hju ftgz hny.', 'fv fbmjmr aqwev jyjhmnjn.']

generate({ seed: 'w', lang: 'ja', words: { min: 1, max: 1 } })[0].text
// 'いだれにがん'  (a single word gets no terminal punctuation)
```

| option | default | |
|---|---|---|
| `seed` | current time | same seed → same string |
| `count` | `1` | number of sentences |
| `words` | `{ min: 4, max: 9 }` | words per sentence |
| `wordLen` | en `2-8` / ja `2-5` | word length (for ja: number of kana, excluding particles) |
| `layout` | `'qwerty'` | en: adjacent-key habits / `'uniform'` picks a–z evenly. ja: frequency table / `'uniform'` picks kana evenly |
| `lang` | `'en'` | `'ja'` generates hiragana directly, mixing in vowel-row / consonant-column / dakuten slips, inserted っ/ん, and dropped kana |
| `seps` | `' ,'` | separator candidates. The first one is used 85% of the time |

Each `Sentence` carries intermediate data in `words[].trace` (en: `·` adjacent / `|` jump, ja: the kana before the slip and how it slipped).

### Turn it into text with an LLM

```ts
import Anthropic from '@anthropic-ai/sdk'
import { type Complete, keysmashIpsum } from 'keysmash-ipsum'

const client = new Anthropic() // reads ANTHROPIC_API_KEY
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

- **Structured output is required.** `complete` receives `{ system, prompt, schema }` and must pass `schema` to the provider's structured output (Anthropic `output_config.format`, OpenAI `response_format` json_schema, …), returning the parsed JSON.
- The schema fixes one key per sentence (`s1`, `s2`, …) and one key per keysmash word (`w1`, `w2`, …), so the word count is guaranteed by structure. Punctuation and separators are restored from the input, not left to the LLM. The result is validated again, and a missing, empty or mistyped key throws.
- All sentences are sent in a single call. Input is a few hundred tokens, so a small model is enough.
- Lower-level pieces: `buildRequest(sentences, { lang })` builds the request, `parseRestored(output, sentences, { lang })` validates and assembles the result. `strict: false` allows free paraphrase (one string per sentence).

## CLI

```
$ npx keysmash-ipsum 6
It does gave see some you.

$ npx keysmash-ipsum --seed s1 --json-detail 6
{"seed":"s1","text":"It does gave see some you.","mid":"ft dsxc gvdw sew swmnm hju."}
```

The argument (or `--count`) is the number of words. Restoration runs through a CLI you are already logged in to, with its structured output: [Claude Code](https://claude.com/claude-code) (`claude -p --json-schema`, default) or [Codex CLI](https://github.com/openai/codex) (`codex exec --output-schema`). It uses that login (your subscription), so no API key is needed, but it counts toward your plan's usage. A call takes 15–60 seconds. The prompt is passed on stdin and nothing goes through a shell.

| option | default | |
|---|---|---|
| `<words>` / `--count` | `8` | number of words |
| `--lang` | `en` | `en` / `ja` |
| `--seed` | current time | same seed → same keysmash |
| `--layout` | `qwerty` | `qwerty` / `uniform` |
| `--llm` | `claude` | `claude` / `codex` |
| `--model` | claude: `haiku` / codex: its default | model passed to the CLI |
| `--raw` | off | print the keysmash without calling the LLM |
| `--json-detail` | off | print `{ seed, text, mid }` as JSON (`mid` is the keysmash) |

## Agent skill

`skills/keysmash-ipsum/` is a skill for agents such as Claude Code. The agent itself does the restoring, so no API key is needed. The CLI imports `src` as `.ts` directly, so it runs from a clone without a build.

```
$ node skills/keysmash-ipsum/scripts/gen.ts --seed s1 --lang ja --trace
```

## License

MIT © [anozon](https://anozon.me)
