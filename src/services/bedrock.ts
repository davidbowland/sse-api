import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import Ajv from 'ajv'

import { LLMMessage, Prompt, ResponseSchema, ThinkingConfig } from '../types'
import { log, logDebug } from '../utils/logging'

// SDK default is 3 attempts (exponential backoff, ~100-500ms base). Bumped to 4 for extra
// resilience against transient Bedrock throttling. This only accounts for the added
// inter-attempt backoff sleep (~7s worst case across all delays) fitting inside the tightest
// caller budget (PostSessionFunction/PostValidateClaimFunction: 35s Lambda timeout, only ever
// invoking the small/fast Haiku prompts) and the worker's 175s budget for the larger Sonnet
// prompts — it does NOT bound the retried Bedrock call durations themselves, which for the
// large Sonnet prompts can legitimately run tens of seconds each. A slow-hang scenario (vs. a
// fast-rejecting throttle) could still exceed the Lambda timeout with 4 attempts; if the Lambda
// times out mid-call, the try/catch below never runs and this failure mode logs nothing beyond
// the bare platform timeout. Do not raise maxAttempts further without re-checking this.
const runtimeClient = new BedrockRuntimeClient({ maxAttempts: 4, region: 'us-east-1' })

// Standard JSON Schema mode (not the JTD dialect used in utils/events.ts) because
// Anthropic's tool input_schema requires standard JSON Schema — this lets one schema
// object drive both the tool definition and response validation below.
const ajv = new Ajv()

const MAX_MESSAGE_HISTORY_COUNT = 30

// Escape < and > so user-controlled text embedded in XML-tagged prompts can't
// break out of JSON string context and be mistaken for instruction tags.
const safeJsonForPrompt = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

const buildTool = (schema: ResponseSchema<unknown>) => ({
  name: schema.toolName,
  description: schema.toolDescription,
  input_schema: schema.jsonSchema,
})

const validateResponse = <T>(schema: ResponseSchema<T>, parsed: unknown): T => {
  const validate = ajv.compile(schema.jsonSchema)
  if (!validate(parsed)) {
    const errors = ajv.errorsText(validate.errors)
    // Log the offending payload here (unlike the routine per-invocation logs) because this is
    // the one moment the feature is meant to catch, and without it a validation failure is undebuggable.
    log('Model response failed schema validation', { errors, parsed, toolName: schema.toolName })
    throw new Error(`Model response failed schema validation for tool "${schema.toolName}": ${errors}`)
  }
  return parsed as T
}

export const invokeModel = async <T>(
  prompt: Prompt,
  schema: ResponseSchema<T>,
  data: string,
  context?: Record<string, unknown>,
): Promise<T> => {
  const promptWithContext = context
    ? { ...prompt, contents: prompt.contents.replace('${context}', safeJsonForPrompt(context)) }
    : prompt
  return invokeModelMessage<T>(promptWithContext, schema, [{ content: data, role: 'user' }])
}

const getMessageHistory = (history: LLMMessage[]): LLMMessage[] => history.slice(-MAX_MESSAGE_HISTORY_COUNT)

const extractJson = (input: string): string => {
  const cleaned = input.replace(/(^\s*|\s*```(?:json)?\s*|\s*$)/gs, '')
  return cleaned.match(/{.*}/s)?.[0] ?? cleaned
}

// Model-dependent: some models only accept manual budget_tokens, others only accept
// adaptive thinking + a separate output_config.effort. See docs/llm-integration-spec.md.
const buildThinkingFields = (
  thinking: ThinkingConfig,
): { thinking: Record<string, unknown>; output_config?: { effort: string } } => {
  switch (thinking.type) {
  case 'enabled':
    return { thinking: { type: 'enabled', budget_tokens: thinking.budgetTokens } }
  case 'adaptive':
    return { thinking: { type: 'adaptive' }, output_config: { effort: thinking.effort } }
  case 'disabled':
    return { thinking: { type: 'disabled' } }
  }
}

export const invokeModelMessage = async <T>(
  prompt: Prompt,
  schema: ResponseSchema<T>,
  history: LLMMessage[],
  data?: Record<string, unknown>,
): Promise<T> => {
  const systemContent = data ? prompt.contents.replace('${data}', safeJsonForPrompt(data)) : prompt.contents
  logDebug('Invoking model', { data, prompt, systemContent })

  const messageBody = {
    anthropic_version: prompt.config.anthropicVersion,
    max_tokens: prompt.config.maxTokens,
    messages: getMessageHistory(history).map((msg) => ({
      role: msg.role,
      content: msg.role === 'assistant' ? JSON.stringify(msg.content) : msg.content,
    })),
    system: systemContent,
    tools: [buildTool(schema)],
    tool_choice: { type: 'auto' },
    ...buildThinkingFields(prompt.config.thinking),
  }
  log('Invoking model', { historyLength: messageBody.messages.length, model: prompt.config.model })
  const command = new InvokeModelCommand({
    body: new TextEncoder().encode(JSON.stringify(messageBody)),
    contentType: 'application/json',
    modelId: prompt.config.model,
  })
  let response
  try {
    response = await runtimeClient.send(command)
  } catch (error: unknown) {
    const err = error as { $metadata?: { httpStatusCode?: number }; message?: string; name?: string } | null
    log('Bedrock invocation failed', {
      errorName: err?.name,
      httpStatusCode: err?.$metadata?.httpStatusCode,
      message: err?.message,
      model: prompt.config.model,
    })
    throw error
  }
  const modelResponse = JSON.parse(new TextDecoder().decode(response.body))

  const toolUseBlock = modelResponse.content.find((b: { type: string }) => b.type === 'tool_use')
  if (toolUseBlock) {
    log('Model response received via tool use', { model: prompt.config.model, toolName: toolUseBlock.name })
    return validateResponse(schema, toolUseBlock.input)
  }

  const textBlock = modelResponse.content.find((b: { type: string }) => b.type === 'text')
  if (!textBlock) {
    log('Model response missing text block and tool use block', {
      blockTypes: modelResponse.content.map((b: { type: string }) => b.type),
      model: prompt.config.model,
      stopReason: modelResponse.stop_reason,
    })
    throw new Error('Bedrock response contained no text block or tool use block')
  }
  log('Model replied without invoking the expected tool; falling back to text extraction', {
    model: prompt.config.model,
    toolName: schema.toolName,
  })
  log('Model response received', {
    model: prompt.config.model,
    stopReason: modelResponse.stop_reason,
    textLength: textBlock.text.length,
  })
  let extractedJson: unknown
  try {
    extractedJson = JSON.parse(extractJson(textBlock.text))
  } catch (error: unknown) {
    log('Failed to parse JSON from fallback text response', {
      message: (error as Error | null)?.message,
      model: prompt.config.model,
      textLength: textBlock.text.length,
    })
    throw error
  }
  return validateResponse(schema, extractedJson)
}
