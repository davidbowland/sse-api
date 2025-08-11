import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { ChatMessage, Prompt } from '../types'
import { log, logDebug } from '../utils/logging'

const runtimeClient = new BedrockRuntimeClient({ region: 'us-east-1' })

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

export const invokeModelMessage = async <T = unknown>(
  prompt: Prompt,
  history: ChatMessage[],
  data?: Record<string, unknown>,
): Promise<T> => {
  const messageContent = data ? prompt.contents.replace('${data}', JSON.stringify(data)) : prompt.contents
  logDebug('Invoking model', { data, messageContent, prompt })
  const messageBody = {
    anthropic_version: prompt.config.anthropicVersion,
    max_tokens: prompt.config.maxTokens,
    messages: [{ content: messageContent, role: 'user' }, ...history],
    temperature: prompt.config.temperature,
    top_k: prompt.config.topK,
  }
  log('Invoking model', {
    history1: history.slice(0, 10),
    history2: history.slice(10, 20),
    history3: history.slice(20),
    messageBody,
  })
  const command = new InvokeModelCommand({
    body: new TextEncoder().encode(JSON.stringify(messageBody)), // new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
    contentType: 'application/json',
    modelId: prompt.config.model,
  })
  const response = await runtimeClient.send(command)
  const modelResponse = JSON.parse(new TextDecoder().decode(response.body))
  log('Model response', { modelResponse, text: modelResponse.content[0].text })
  return JSON.parse(modelResponse.content[0].text.replace(/(^\s*<thinking>.*?<\/thinking>\s*|\s*```(json)?\s*)/gs, ''))
}
