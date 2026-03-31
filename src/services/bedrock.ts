import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { ChatMessage, Prompt } from '../types'
import { log, logDebug } from '../utils/logging'

const runtimeClient = new BedrockRuntimeClient({ region: 'us-east-1' })

const MAX_MESSAGE_HISTORY_COUNT = 30

export const invokeModel = async <T = unknown>(
  prompt: Prompt,
  data: string,
  context?: Record<string, unknown>,
): Promise<T> => {
  const promptWithContext = context
    ? { ...prompt, contents: prompt.contents.replace('${context}', JSON.stringify(context)) }
    : prompt
  return invokeModelMessage<T>(promptWithContext, [{ content: data, role: 'user' }])
}

const getMessageHistory = (history: ChatMessage[]): ChatMessage[] => history.slice(-MAX_MESSAGE_HISTORY_COUNT)

const stripCodeFences = (input: string): string => input.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gs, '').trim()

export const invokeModelMessage = async <T = unknown>(
  prompt: Prompt,
  history: ChatMessage[],
  data?: Record<string, unknown>,
): Promise<T> => {
  const systemContent = data ? prompt.contents.replace('${data}', JSON.stringify(data)) : prompt.contents
  logDebug('Invoking model', { data, prompt, systemContent })

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
  log('Invoking model', {
    history1: history.slice(0, 10),
    history2: history.slice(10, 20),
    history3: history.slice(20),
    messageBody,
    messages1: messageBody.messages.slice(0, 10),
    messages2: messageBody.messages.slice(10, 20),
    messages3: messageBody.messages.slice(20),
    model: prompt.config.model,
  })
  const command = new InvokeModelCommand({
    body: new TextEncoder().encode(JSON.stringify(messageBody)), // new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
    contentType: 'application/json',
    modelId: prompt.config.model,
  })
  const response = await runtimeClient.send(command)
  const modelResponse = JSON.parse(new TextDecoder().decode(response.body))
  const textBlock = modelResponse.content.find((b: { type: string }) => b.type === 'text')
  if (!textBlock) {
    log('Model response missing text block', { modelResponse })
    throw new Error('Bedrock response contained no text block')
  }
  log('Model response', { modelResponse, text: textBlock.text })
  return JSON.parse(stripCodeFences(textBlock.text))
}
