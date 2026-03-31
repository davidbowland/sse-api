# Extended Thinking + Model Tiering Design

**Date:** 2026-03-31  
**Status:** Approved

## Problem

Conversations of 15–20 messages cause the LLM to drift from its system prompt instructions — losing neutrality, stating opinions, or asking questions when it shouldn't. A hard message-history limit of 10 was added as a workaround, but that causes (a) & (b) style forgetfulness (the model loses earlier context). The goal is to fix the root cause (instruction drift) and raise the history limit to 30 messages.

## Solution

Enable extended thinking on all conversation prompts (and analysis), upgrade to `claude-sonnet-4-6`, and use `claude-haiku-4-5` for the two one-shot prompts. The thinking budget gives the model dedicated reasoning space to re-evaluate its instructions before each response, directly preventing drift. With drift solved, the history limit can safely be raised from 10 to 30.

## Architecture

No new files. Changes touch `src/types.ts`, `src/services/bedrock.ts`, and the 9 `.txt` prompt configs.

## Component Changes

### `src/types.ts`

Make `temperature` and `topK` optional on `PromptConfig` (they are incompatible with extended thinking and will be omitted from thinking-enabled prompts). Add optional `thinkingBudgetTokens`:

```ts
export interface PromptConfig {
  anthropicVersion: string
  maxTokens: number
  model: string
  temperature?: number
  topK?: number
  thinkingBudgetTokens?: number
}
```

### `src/services/bedrock.ts`

**`getMessageHistory`**: Remove the two-tier filtering strategy (recent 10 + older user-only messages up to 25). Replace with: return the last 30 messages, all roles preserved. The `MAX_RECENT_MESSAGE_COUNT` constant is deleted; `MAX_MESSAGE_HISTORY_COUNT` becomes 30.

**`invokeModelMessage`**: Conditionally build the message body based on whether `thinkingBudgetTokens` is present:

```ts
const thinkingConfig = prompt.config.thinkingBudgetTokens
  ? { thinking: { type: 'enabled', budget_tokens: prompt.config.thinkingBudgetTokens } }
  : { temperature: prompt.config.temperature, top_k: prompt.config.topK }

const messageBody = {
  anthropic_version: prompt.config.anthropicVersion,
  max_tokens: prompt.config.maxTokens,
  messages: getMessageHistory(history),
  system: systemContent,
  ...thinkingConfig,
}
```

**Response parsing**: The thinking API returns content as separate typed blocks (`type: 'thinking'` and `type: 'text'`), not inline `<thinking>` tags. Replace the existing regex-based strip with a block lookup:

````ts
const stripCodeFences = (input: string): string =>
  input.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gs, '').trim()

// in invokeModelMessage:
const textBlock = modelResponse.content.find((b: { type: string }) => b.type === 'text')
return JSON.parse(stripCodeFences(textBlock.text))
````

The `<thinking>` regex removal is deleted — it was a workaround for inline thinking tags that no longer applies with the structured API.

### Prompt config changes (first-line JSON in `prompts/*.txt`)

| File                   | Model                                    | `thinkingBudgetTokens` | `maxTokens` | `temperature` / `topK` |
| ---------------------- | ---------------------------------------- | ---------------------- | ----------- | ---------------------- |
| `validate-claim.txt`   | `us.anthropic.claude-haiku-4-5-20251001` | —                      | 1500        | kept                   |
| `suggest-claim.txt`    | `us.anthropic.claude-haiku-4-5-20251001` | 5000                   | 8000        | removed                |
| `start-chat.txt`       | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `probe-confidence.txt` | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `probe-reasons.txt`    | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `end-chat.txt`         | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `guess-reasons.txt`    | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `new-confidence.txt`   | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |
| `analysis.txt`         | `us.anthropic.claude-sonnet-4-6`         | 40000                  | 50000       | removed                |

`temperature` and `topK` are removed from all thinking-enabled prompts because the thinking API requires `temperature: 1` implicitly and does not support `topK`.

## Data Flow

No change to data flow. The session history stored in DynamoDB is unchanged. The thinking content is consumed by the model but never stored or returned to the client — only the `text` block is parsed and returned.

## Error Handling

No new error cases introduced. If `textBlock` is undefined (model returned no text block), the existing `JSON.parse` will throw, which is already caught upstream in `post-llm-response.ts` with a graceful fallback message.

## Testing

- Unit test `getMessageHistory` with >30 messages: verify exactly 30 returned, all roles preserved
- Unit test response parsing: mock a response with both `thinking` and `text` blocks, verify only `text` is parsed
- Integration test: send a 25-message conversation and verify the model response still follows its instructions (no opinion statements, no questions where forbidden)
- Smoke test each prompt in isolation to confirm Haiku/Sonnet routing is correct
