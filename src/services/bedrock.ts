import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

import { ChatMessage, Prompt } from '../types'
import { getPromptById } from './dynamodb'
import { log } from '../utils/logging'

const runtimeClient = new BedrockRuntimeClient({ region: 'us-east-1' })

export const invokeModel = async (prompt: any, data: string, context?: any): Promise<any> => {
  const promptWithContext = context
    ? { ...prompt, contents: prompt.contents.replace('${context}', JSON.stringify(context)) }
    : prompt
  return invokeModelMessage(promptWithContext, [{ content: data, role: 'user' }])
}

export const invokeModelMessage = async (prompt: Prompt, history: ChatMessage[], data?: any): Promise<any> => {
  const messageBody = {
    anthropic_version: prompt.config.anthropicVersion,
    max_tokens: prompt.config.maxTokens,
    messages: history,
    system: data ? prompt.contents.replace('${data}', JSON.stringify(data)) : prompt.contents,
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
  return modelResponse.content[0].text
}

export const parseJson = async (input: Promise<string>, targetFormat: string): Promise<any> => {
  const jsonString = await input
  try {
    return JSON.parse(jsonString)
  } catch (error: any) {
    log('Error parsing json', { json: jsonString })
    const fixJsonPrompt = await getPromptById('fix-json')
    const data = [
      '<target_format>',
      targetFormat,
      '</target_format>',
      '<invalid_json>',
      jsonString,
      '</invalid_json>',
    ].join('\n')
    const fixedJsonString = await invokeModel(fixJsonPrompt, data)
    try {
      return JSON.parse(fixedJsonString)
    } catch (fixedError: any) {
      log('Error parsing fixed json', { json: fixedJsonString })
      return undefined
    }
  }
}
