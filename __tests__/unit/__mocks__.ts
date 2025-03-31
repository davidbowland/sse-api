/* eslint sort-keys:0 */
import { ChatMessage, Prompt, PromptConfig, PromptId, Session, SessionId } from '@types'

// Bedrock

export const invokeModelResponseData = {
  id: 'msg_bdrk_01YA7pmVfUZvZM9reruSimYT',
  type: 'message',
  role: 'assistant',
  model: 'claude-3-5-sonnet-20241022',
  content: [
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

export const invokeModelResponse = {
  $metadata: {
    attempts: 1,
    cfId: undefined,
    extendedRequestId: undefined,
    httpStatusCode: 200,
    requestId: 'fragglerock',
    retryDelay: 0,
    statusCode: 200,
    success: true,
    totalRetryDelay: 0,
  },
  body: new TextEncoder().encode(JSON.stringify(invokeModelResponseData)),
}

// Messages

export const assistantMessage: ChatMessage = { content: 'Whatchu mean?', role: 'assistant' }
export const userMessage: ChatMessage = { content: 'I think I saw a cat', role: 'user' }

// Prompts

export const promptConfig: PromptConfig = {
  anthropicVersion: 'bedrock-2023-05-31',
  maxTokens: 256,
  model: 'the-best-ai:1.0',
  temperature: 0.5,
  topK: 250,
}

export const promptId: PromptId = '5253'

export const prompt: Prompt = {
  config: promptConfig,
  contents: 'You are a helpful assistant. ${data}',
}

// Sessions

export const sessionId: SessionId = '34151'

export const session: Session = {
  claim: 'Spiders are real',
  confidence: 'strongly agree',
  expiration: 1743407368,
  history: [userMessage, assistantMessage],
  reasons: ["They're animatronic"],
}
