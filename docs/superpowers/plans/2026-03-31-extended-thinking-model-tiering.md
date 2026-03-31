# Extended Thinking + Model Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable extended thinking on all conversation prompts, switch one-shot prompts to Haiku, and raise the message history limit from 10 to 30 to eliminate instruction drift in long conversations.

**Architecture:** `PromptConfig` gains an optional `thinkingBudgetTokens` field; `invokeModelMessage` conditionally sends a `thinking` block instead of `temperature`/`top_k`; response parsing switches from regex to a typed block lookup; `getMessageHistory` simplifies to last-30-all-roles.

**Tech Stack:** TypeScript, AWS Bedrock (`@aws-sdk/client-bedrock-runtime`), Jest

---

### Task 1: Update `PromptConfig` type and mock fixture

**Files:**

- Modify: `src/types.ts`
- Modify: `__tests__/unit/__mocks__.ts`

- [ ] **Step 1: Make `temperature` and `topK` optional, add `thinkingBudgetTokens` to `PromptConfig`**

In `src/types.ts`, replace the `PromptConfig` interface:

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

- [ ] **Step 2: Add thinking fixtures to the shared mock file**

In `__tests__/unit/__mocks__.ts`, add after the existing `prompt` export:

```ts
export const promptConfigWithThinking: PromptConfig = {
  anthropicVersion: 'bedrock-2023-05-31',
  maxTokens: 50000,
  model: 'us.anthropic.claude-sonnet-4-6',
  thinkingBudgetTokens: 40000,
}

export const promptWithThinking: Prompt = {
  config: promptConfigWithThinking,
  contents: 'You are a helpful assistant. ${data}',
}

export const invokeModelThinkingResponseData = {
  id: 'msg_bdrk_thinking_01',
  type: 'message',
  role: 'assistant',
  model: 'us.anthropic.claude-sonnet-4-6',
  content: [
    {
      type: 'thinking',
      thinking: 'Let me consider the instructions carefully before responding.',
    },
    {
      type: 'text',
      text:
        '{\n' +
        '  "suggestions": [\n' +
        '    "Voter ID requirements strengthen democracy.",\n' +
        '    "Museums in federal agencies are a waste of taxpayer money.",\n' +
        '    "Universities should lose federal funding over antisemitism.",\n' +
        '    "The president should have the power to serve unlimited terms.",\n' +
        '    "The US should implement a 100% tariff on all foreign goods.",\n' +
        '    "Congress should abolish collective bargaining for federal employees."\n' +
        '  ]\n' +
        '}',
    },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 3398, output_tokens: 99 },
}

export const invokeModelThinkingResponse = {
  $metadata: {
    attempts: 1,
    cfId: undefined,
    extendedRequestId: undefined,
    httpStatusCode: 200,
    requestId: 'fragglerock-thinking',
    retryDelay: 0,
    statusCode: 200,
    success: true,
    totalRetryDelay: 0,
  },
  body: new TextEncoder().encode(JSON.stringify(invokeModelThinkingResponseData)),
}
```

- [ ] **Step 3: Run typecheck to confirm no type errors**

```bash
npm run typecheck
```

Expected: no errors. If errors appear they will be in files that construct a `PromptConfig` literal — add the missing optional fields or remove the now-optional ones as needed.

- [ ] **Step 4: Run existing tests to confirm nothing broken**

```bash
npm test -- --testPathPattern=bedrock
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts __tests__/unit/__mocks__.ts
git commit -m "feat: add thinkingBudgetTokens to PromptConfig type and test fixtures"
```

---

### Task 2: Write failing tests for `bedrock.ts` changes

**Files:**

- Modify: `__tests__/unit/services/bedrock.test.ts`

- [ ] **Step 1: Add imports for new fixtures**

At the top of `__tests__/unit/services/bedrock.test.ts`, add `promptWithThinking`, `invokeModelThinkingResponse` to the import from `'../__mocks__'`:

```ts
import {
  assistantMessage,
  invokeModelSuggestedClaims,
  invokeModelSuggestedClaimsResponse,
  invokeModelThinkingResponse,
  prompt,
  promptWithThinking,
  userMessage,
} from '../__mocks__'
```

- [ ] **Step 2: Add test — thinking config sends `thinking` block, omits `temperature`/`top_k`**

Inside the existing `describe('invokeModelMessage', ...)` block, add a new nested describe after the existing tests:

```ts
describe('with thinking config', () => {
  const history = [assistantMessage, userMessage]

  beforeAll(() => {
    mockSend.mockResolvedValue(invokeModelThinkingResponse)
  })

  it('should send thinking block instead of temperature and top_k', async () => {
    const result = await invokeModelMessage(promptWithThinking, history)

    expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
    expect(mockSend).toHaveBeenCalledWith({
      body: new TextEncoder().encode(
        JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 50000,
          messages: [...history],
          system: promptWithThinking.contents,
          thinking: { type: 'enabled', budget_tokens: 40000 },
        }),
      ),
      contentType: 'application/json',
      modelId: 'us.anthropic.claude-sonnet-4-6',
    })
  })
})
```

- [ ] **Step 3: Add test — history truncated to last 30 messages**

Still inside `describe('invokeModelMessage', ...)`, add:

```ts
it('should truncate history to the last 30 messages preserving all roles', async () => {
  mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
  const longHistory = Array.from({ length: 35 }, (_, i) => ({
    content: `message ${i}`,
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
  }))

  await invokeModelMessage(prompt, longHistory)

  const sentBody = JSON.parse(new TextDecoder().decode(mockSend.mock.calls[mockSend.mock.calls.length - 1][0].body))
  expect(sentBody.messages).toHaveLength(30)
  expect(sentBody.messages[0].content).toBe('message 5')
  expect(sentBody.messages[29].content).toBe('message 34')
})
```

- [ ] **Step 4: Run tests to confirm they fail for the right reasons**

```bash
npm test -- --testPathPattern=bedrock
```

Expected: the two new tests FAIL. The thinking test should fail with a mismatch on the sent body (it will contain `temperature`/`top_k` instead of `thinking`). The history test should fail showing 2 messages sent instead of 30 (the mock history only has 2 messages, but the truncation logic should be correct — if the test was written with the long history it would show the wrong slice). The existing tests should still PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/unit/services/bedrock.test.ts
git commit -m "test: add failing tests for extended thinking and history limit"
```

---

### Task 3: Implement `bedrock.ts` changes

**Files:**

- Modify: `src/services/bedrock.ts`

- [ ] **Step 1: Simplify `getMessageHistory` to last 30, all roles**

In `src/services/bedrock.ts`, replace the two constants and the `getMessageHistory` function:

```ts
const MAX_MESSAGE_HISTORY_COUNT = 30

const getMessageHistory = (history: ChatMessage[]): ChatMessage[] => history.slice(-MAX_MESSAGE_HISTORY_COUNT)
```

- [ ] **Step 2: Update `invokeModelMessage` to conditionally use thinking config**

Replace the `messageBody` construction in `invokeModelMessage`:

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

- [ ] **Step 3: Update response parsing to use typed block lookup**

Add `stripCodeFences` as a module-level helper at the top of `src/services/bedrock.ts`, before `invokeModelMessage`:

````ts
const stripCodeFences = (input: string): string => input.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gs, '').trim()
````

Then replace the final `return` statement in `invokeModelMessage`:

```ts
const textBlock = modelResponse.content.find((b: { type: string }) => b.type === 'text')
return JSON.parse(stripCodeFences(textBlock.text))
```

Remove the old regex-based return line. The `<thinking>` regex removal is no longer needed — the thinking API returns thinking as a separate typed block, never inline in text.

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npm test -- --testPathPattern=bedrock
```

Expected: all tests PASS including the two new ones.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/bedrock.ts
git commit -m "feat: enable extended thinking support and raise history limit to 30"
```

---

### Task 4: Update prompt config files

**Files:**

- Modify: `prompts/validate-claim.txt` (line 1 only)
- Modify: `prompts/suggest-claim.txt` (line 1 only)
- Modify: `prompts/start-chat.txt` (line 1 only)
- Modify: `prompts/probe-confidence.txt` (line 1 only)
- Modify: `prompts/probe-reasons.txt` (line 1 only)
- Modify: `prompts/end-chat.txt` (line 1 only)
- Modify: `prompts/guess-reasons.txt` (line 1 only)
- Modify: `prompts/new-confidence.txt` (line 1 only)
- Modify: `prompts/analysis.txt` (line 1 only)

Each file's first line is a JSON comment (`# {...}`) parsed at deploy time by `scripts/deploy-prompts.ts` into DynamoDB. Only line 1 changes; the prompt body is untouched.

- [ ] **Step 1: Update `validate-claim.txt` — Haiku, no thinking**

Replace line 1 with:

```
# {"anthropicVersion":"bedrock-2023-05-31","maxTokens":1500,"model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","temperature":0.4,"topK":50000}
```

- [ ] **Step 2: Update `suggest-claim.txt` — Haiku, 5k thinking budget**

Replace line 1 with:

```
# {"anthropicVersion":"bedrock-2023-05-31","maxTokens":8000,"model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","thinkingBudgetTokens":5000}
```

- [ ] **Step 3: Update five conversation prompts — Sonnet 4.6, 40k thinking**

Replace line 1 in each of the following files with the same value:

```
# {"anthropicVersion":"bedrock-2023-05-31","maxTokens":50000,"model":"us.anthropic.claude-sonnet-4-6","thinkingBudgetTokens":40000}
```

Files to update:

- `prompts/start-chat.txt`
- `prompts/probe-confidence.txt`
- `prompts/probe-reasons.txt`
- `prompts/end-chat.txt`
- `prompts/new-confidence.txt`

- [ ] **Step 4: Update `guess-reasons.txt` — Sonnet 4.6, 40k thinking**

This file already uses `us.anthropic.claude-sonnet-4-20250514-v1:0`. Replace line 1 with:

```
# {"anthropicVersion":"bedrock-2023-05-31","maxTokens":50000,"model":"us.anthropic.claude-sonnet-4-6","thinkingBudgetTokens":40000}
```

- [ ] **Step 5: Update `analysis.txt` — Sonnet 4.6, 40k thinking**

Replace line 1 with:

```
# {"anthropicVersion":"bedrock-2023-05-31","maxTokens":50000,"model":"us.anthropic.claude-sonnet-4-6","thinkingBudgetTokens":40000}
```

- [ ] **Step 6: Run typecheck and tests one final time**

```bash
npm run typecheck && npm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add prompts/
git commit -m "feat: upgrade models to Sonnet 4.6/Haiku 4.5 with extended thinking budgets"
```

---

### Task 5: Deploy prompts to DynamoDB

**Files:**

- No code changes — runs the existing deploy script

- [ ] **Step 1: Deploy updated prompt configs**

```bash
npm run deploy-prompts
```

Expected: all 9 prompts written to DynamoDB with updated config. Verify in AWS console or CloudWatch logs that each prompt's `model` and `thinkingBudgetTokens` values match the plan.

- [ ] **Step 2: Smoke test a full conversation**

Using the running local or staging environment, start a session and exchange at least 15 messages. Verify:

- The assistant remains neutral (no opinions stated)
- The assistant does not ask questions when the prompt forbids it
- Earlier user messages (beyond message 10) are still referenced correctly
- Responses are still short (a few sentences)
