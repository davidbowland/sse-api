import {
  assistantMessage,
  invokeModelSuggestedClaims,
  invokeModelSuggestedClaimsResponse,
  prompt,
  userMessage,
} from '../__mocks__'
import { invokeModel, invokeModelMessage } from '@services/bedrock'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  InvokeModelCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('bedrock', () => {
  const data = 'super-happy-fun-data'

  describe('invokeModel', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = await invokeModel(prompt, data)
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: data, role: 'user' }],
            system: prompt.contents,
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
    const history = [assistantMessage, userMessage]

    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = await invokeModelMessage(prompt, history)
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: history,
            system: prompt.contents,
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
    })

    it('should inject passed data into the prompt', async () => {
      const promptWithData = {
        ...prompt,
        contents: 'My data should go here: ${data}',
      }
      const result = await invokeModelMessage(promptWithData, history, { foo: 'bar' })
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: history,
            system: 'My data should go here: {"foo":"bar"}',
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
    })
  })
})
