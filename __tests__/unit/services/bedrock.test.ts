import { invokeModel, invokeModelMessage, parseJson } from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'

import {
  assistantMessage,
  invokeModelInvalidResponse,
  invokeModelSuggestedClaims,
  invokeModelSuggestedClaimsResponse,
  invokeModelSuggestedClaimsResponseData,
  prompt,
  userMessage,
} from '../__mocks__'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  InvokeModelCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@services/dynamodb')
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
  logDebug: jest.fn(),
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('bedrock', () => {
  const data = 'super-happy-fun-data'

  describe('invokeModel', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const { modelResponse } = await invokeModel(prompt, data)
      const result = JSON.parse(modelResponse)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [
              { content: prompt.contents, role: 'user' },
              { content: data, role: 'user' },
            ],
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
      const { modelResponse } = await invokeModel(promptWithContext, data, { foo: 'bar' })
      const result = JSON.parse(modelResponse)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [
              { content: 'My context should go here: {"foo":"bar"}', role: 'user' },
              { content: data, role: 'user' },
            ],
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
      const { modelResponse } = await await invokeModelMessage(prompt, history)
      const result = JSON.parse(modelResponse)
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: prompt.contents, role: 'user' }, ...history],
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
      const { modelResponse } = await await invokeModelMessage(promptWithData, history, { foo: 'bar' })
      const result = JSON.parse(modelResponse)
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: 'My data should go here: {"foo":"bar"}', role: 'user' }, ...history],
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
    })
  })

  describe('parseJson', () => {
    const jsonString = invokeModelSuggestedClaimsResponseData.content[0].text
    const expectedFormat = '{"suggestions":[string]}'
    const formattingData =
      '<target_format>\n' +
      '{"suggestions":[string]}\n' +
      '</target_format>\n' +
      '<invalid_json>\n' +
      'invalid json\n' +
      '</invalid_json>'

    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
      jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    })

    it('should parse the json without invoking the LLM', async () => {
      const result = await parseJson(jsonString, expectedFormat)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(dynamodb.getPromptById).not.toHaveBeenCalled()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('should invoke the LLM if the initial json is invalid', async () => {
      const result = await parseJson('invalid json', expectedFormat)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(dynamodb.getPromptById).toHaveBeenCalledWith('fix-json')
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [
              { content: prompt.contents, role: 'user' },
              { content: formattingData, role: 'user' },
            ],
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
    })

    it("should return undefined if the json is invalid and LLM can't fix it", async () => {
      mockSend.mockResolvedValueOnce(invokeModelInvalidResponse)
      const result = await parseJson('invalid json', expectedFormat)

      expect(result).toBeUndefined()
      expect(dynamodb.getPromptById).toHaveBeenCalledWith('fix-json')
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [
              { content: prompt.contents, role: 'user' },
              { content: formattingData, role: 'user' },
            ],
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
