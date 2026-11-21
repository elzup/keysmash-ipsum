import type { Complete } from '../restore.ts'
import { claudeCodeComplete } from './claude-code.ts'
import { codexComplete } from './codex.ts'

/**
 * subscription でログイン済みの CLI を LLM として使う adapter。
 * どれも structured output (JSON Schema) を CLI 側で受け付けるものだけを置く
 */
export const LLM_NAMES = ['claude', 'codex'] as const
export type LlmName = (typeof LLM_NAMES)[number]

const ADAPTERS: Record<LlmName, (model?: string) => Complete> = {
  claude: claudeCodeComplete,
  codex: codexComplete,
}

export const createComplete = (name: LlmName, model?: string): Complete =>
  ADAPTERS[name](model)
