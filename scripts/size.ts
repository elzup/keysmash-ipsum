// README の Size 表用: ビルド済み lib/esm を import したときのサイズを測る (bundlephobia と同じ minify + gzip)
// 先に pnpm build が要る
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const ENTRIES = {
  'everything (`import *`)': "export * from './lib/esm/index.js'",
  '`generate` + `generateWords` only':
    "export { generate, generateWords } from './lib/esm/index.js'",
} as const

const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} kB`

const measure = async (contents: string) => {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  })
  const code = result.outputFiles[0].contents
  return { min: code.byteLength, gzip: gzipSync(code).byteLength }
}

console.log('| import | minified | min + gzip |')
console.log('|---|---|---|')
for (const [label, contents] of Object.entries(ENTRIES)) {
  const { min, gzip } = await measure(contents)
  console.log(`| ${label} | ${kb(min)} | ${kb(gzip)} |`)
}
