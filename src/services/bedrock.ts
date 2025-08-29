import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { ChatMessage, Prompt } from '../types'
import { log, logDebug } from '../utils/logging'

const runtimeClient = new BedrockRuntimeClient({ region: 'us-east-1' })

const MAX_MESSAGE_HISTORY_COUNT = 25
const MAX_RECENT_MESSAGE_COUNT = 10

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

const getMessageHistory = (history: ChatMessage[]): ChatMessage[] => {
  if (history.length <= MAX_RECENT_MESSAGE_COUNT) {
    return history
  }
  const recentMessages = history.slice(-MAX_RECENT_MESSAGE_COUNT)
  const userMessages = history.slice(0, -MAX_RECENT_MESSAGE_COUNT).filter((msg: ChatMessage) => msg.role === 'user')
  return userMessages.concat(recentMessages).slice(-MAX_MESSAGE_HISTORY_COUNT)
}

export const invokeModelMessage = async <T = unknown>(
  prompt: Prompt,
  history: ChatMessage[],
  data?: Record<string, unknown>,
): Promise<T> => {
  const systemContent = data ? prompt.contents.replace('${data}', JSON.stringify(data)) : prompt.contents
  logDebug('Invoking model', { data, prompt, systemContent })

  const messageBody = {
    anthropic_version: prompt.config.anthropicVersion,
    max_tokens: prompt.config.maxTokens,
    messages: getMessageHistory(history),
    system: systemContent,
    temperature: prompt.config.temperature,
    top_k: prompt.config.topK,
  }
  log('Invoking model', {
    history1: history.slice(0, 10),
    history2: history.slice(10, 20),
    history3: history.slice(20),
    messageBody,
    messages1: messageBody.messages.slice(0, 10),
    messages2: messageBody.messages.slice(10, 20),
    messages3: messageBody.messages.slice(20),
  })
  const command = new InvokeModelCommand({
    body: new TextEncoder().encode(JSON.stringify(messageBody)), // new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
    contentType: 'application/json',
    modelId: prompt.config.model,
  })
  const response = await runtimeClient.send(command)
  const modelResponse = JSON.parse(new TextDecoder().decode(response.body))
  log('Model response', { modelResponse, text: modelResponse.content[0].text })
  return JSON.parse(
    modelResponse.content[0].text.replace(/(^\s*<thinking>.*?<\/thinking>\s*|^\s*|\s*`(json)?\s*|\s*$)/gs, ''),
  )
}
