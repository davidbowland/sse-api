import {
  assistantLlmMessage,
  assistantLlmResponse,
  invokeModelNoTextBlockResponse,
  invokeModelSuggestClaims,
  invokeModelSuggestClaimsResponse,
  invokeModelThinkingResponse,
  prompt,
  promptWithThinking,
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
            max_tokens: 256,
            messages: [{ role: 'user', content: data }],
            system: prompt.contents,
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
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
            max_tokens: 256,
            messages: [{ role: 'user', content: data }],
            system: 'My context should go here: {"foo":"bar"}',
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
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
            max_tokens: 256,
            messages: expectedMessages,
            system: prompt.contents,
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
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
            max_tokens: 256,
            messages: expectedMessages,
            system: 'My data should go here: {"foo":"bar"}',
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
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

    describe('with thinking config', () => {
      it('should send thinking block instead of temperature and top_k', async () => {
        mockSend.mockResolvedValue(invokeModelThinkingResponse)

        const result = await invokeModelMessage(promptWithThinking, history)

        expect(result).toEqual({ suggestions: ['Claim A', 'Claim B'] })
        expect(mockSend).toHaveBeenCalledWith({
          body: new TextEncoder().encode(
            JSON.stringify({
              anthropic_version: 'bedrock-2023-05-31',
              max_tokens: 50000,
              messages: expectedMessages,
              system: promptWithThinking.contents,
              thinking: { type: 'enabled', budget_tokens: 40000 },
            }),
          ),
          contentType: 'application/json',
          modelId: 'us.anthropic.claude-sonnet-4-6',
        })
      })
    })
  })
})
