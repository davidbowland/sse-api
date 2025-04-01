import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { ChatMessage, Prompt } from '../types'

const runtimeClient = new BedrockRuntimeClient({ region: 'us-east-1' })

export const invokeModel = async (prompt: any, data: string) =>
  invokeModelMessage(prompt, [{ content: data, role: 'user' }])

export const invokeModelMessage = async (prompt: Prompt, history: ChatMessage[]) => {
  const messageBody = {
    anthropic_version: prompt.config.anthropicVersion,
    max_tokens: prompt.config.maxTokens,
    messages: history,
    system: prompt.contents,
    temperature: prompt.config.temperature,
    top_k: prompt.config.topK,
  }
  const command = new InvokeModelCommand({
    body: new TextEncoder().encode(JSON.stringify(messageBody)), // new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")
    contentType: 'application/json',
    modelId: prompt.config.model,
  })
  const response = await runtimeClient.send(command)
  const modelResponse = JSON.parse(new TextDecoder().decode(response.body))
  const suggestions = JSON.parse(modelResponse.content[0].text).suggestions
  return suggestions
}
