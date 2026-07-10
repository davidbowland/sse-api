import {
  assistantLlmMessage,
  assistantLlmResponse,
  invokeModelNoTextBlockResponse,
  invokeModelSuggestClaims,
  invokeModelSuggestClaimsResponse,
  invokeModelThinkingResponse,
  prompt,
  promptManualThinking,
  userLlmMessage,
} from '../__mocks__'
import { invokeModel, invokeModelMessage } from '@services/bedrock'
import { LLMMessage } from '@types'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  InvokeModelCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logDebug: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('bedrock', () => {
  const data = 'super-happy-fun-data'

  describe('invokeModel', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = await invokeModel(prompt, data)

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: [{ role: 'user', content: data }],
            system: prompt.contents,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should inject context into the prompt when passed', async () => {
      const promptWithContext = {
        ...prompt,
        contents: 'My context should go here: ${context}',
      }
      const result = await invokeModel(promptWithContext, data, { foo: 'bar' })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: [{ role: 'user', content: data }],
            system: 'My context should go here: {"foo":"bar"}',
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should use manual budget_tokens thinking for models that require it, with no output_config', async () => {
      const result = await invokeModel(promptManualThinking, data)

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1500,
            messages: [{ role: 'user', content: data }],
            system: promptManualThinking.contents,
            thinking: { type: 'enabled', budget_tokens: 1024 },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      })
    })

    it('should disable thinking entirely when configured', async () => {
      const promptWithDisabledThinking = {
        ...promptManualThinking,
        config: { ...promptManualThinking.config, thinking: { type: 'disabled' as const } },
      }
      await invokeModel(promptWithDisabledThinking, data)

      const lastBody = mockSend.mock.calls.at(-1)[0].body
      const sentBody = JSON.parse(new TextDecoder().decode(lastBody))
      expect(sentBody.thinking).toEqual({ type: 'disabled' })
      expect(sentBody.output_config).toBeUndefined()
    })
  })

  describe('invokeModelMessage', () => {
    const history: LLMMessage[] = [assistantLlmMessage, userLlmMessage]
    const expectedMessages = [
      { role: 'assistant', content: JSON.stringify(assistantLlmResponse) },
      { role: 'user', content: userLlmMessage.content },
    ]

    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = await invokeModelMessage(prompt, history)
      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: expectedMessages,
            system: prompt.contents,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should stringify assistant message content and pass user message content as-is', async () => {
      mockSend.mockResolvedValue(invokeModelSuggestClaimsResponse)
      const llmHistory: LLMMessage[] = [assistantLlmMessage, userLlmMessage]
      await invokeModelMessage(prompt, llmHistory)

      const lastBody = mockSend.mock.calls.at(-1)[0].body
      const sentBody = JSON.parse(new TextDecoder().decode(lastBody))
      expect(sentBody.messages).toEqual([
        { role: 'assistant', content: JSON.stringify(assistantLlmResponse) },
        { role: 'user', content: userLlmMessage.content },
      ])
    })

    it('should inject passed data into the prompt', async () => {
      const promptWithData = {
        ...prompt,
        contents: 'My data should go here: ${data}',
      }
      const result = await invokeModelMessage(promptWithData, history, { foo: 'bar' })
      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: expectedMessages,
            system: 'My data should go here: {"foo":"bar"}',
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should truncate history to the last 30 messages', async () => {
      mockSend.mockResolvedValue(invokeModelSuggestClaimsResponse)
      const longHistory: LLMMessage[] = Array.from({ length: 35 }, (_, i) => ({
        content: `message ${i}`,
        role: 'user' as const,
      }))

      await invokeModelMessage(prompt, longHistory)

      const lastBody = mockSend.mock.calls.at(-1)[0].body
      const sentBody = JSON.parse(new TextDecoder().decode(lastBody))
      expect(sentBody.messages).toHaveLength(30)
      expect(sentBody.messages[0].content).toBe('message 5')
      expect(sentBody.messages[29].content).toBe('message 34')
    })

    it('should throw when response contains no text block', async () => {
      mockSend.mockResolvedValue(invokeModelNoTextBlockResponse)

      await expect(invokeModelMessage(prompt, [userLlmMessage])).rejects.toThrow(
        'Bedrock response contained no text block',
      )
    })

    it('should extract JSON from response with thinking block', async () => {
      mockSend.mockResolvedValue(invokeModelThinkingResponse)

      const result = await invokeModelMessage(prompt, history)

      expect(result).toEqual({ suggestions: ['Claim A', 'Claim B'] })
    })
  })
})
