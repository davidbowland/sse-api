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
import { invokeModel, invokeModelMessage, parseJson } from '@services/bedrock'

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
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('bedrock', () => {
  const data = 'super-happy-fun-data'

  describe('invokeModel', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = JSON.parse(await invokeModel(prompt, data))
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

    it('should inject context into the prompt when passed', async () => {
      const promptWithContext = {
        ...prompt,
        contents: 'My context should go here: ${context}',
      }
      const result = JSON.parse(await invokeModel(promptWithContext, data, { foo: 'bar' }))
      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: data, role: 'user' }],
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
    const history = [assistantMessage, userMessage]

    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestedClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = JSON.parse(await invokeModelMessage(prompt, history))
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
      const result = JSON.parse(await invokeModelMessage(promptWithData, history, { foo: 'bar' }))
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
      const json = Promise.resolve(jsonString)
      const result = await parseJson(json, expectedFormat)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(jest.mocked(dynamodb).getPromptById).not.toHaveBeenCalled()
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('should invoke the LLM if the initial json is invalid', async () => {
      const json = Promise.resolve('invalid json')
      const result = await parseJson(json, expectedFormat)

      expect(result).toEqual({ suggestions: invokeModelSuggestedClaims })
      expect(jest.mocked(dynamodb).getPromptById).toHaveBeenCalledWith('fix-json')
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: formattingData, role: 'user' }],
            system: prompt.contents,
            temperature: 0.5,
            top_k: 250,
          }),
        ),
        contentType: 'application/json',
        modelId: 'the-best-ai:1.0',
      })
    })

    it("should return undefined if the json is invalid and LLM can't fix it", async () => {
      const json = Promise.resolve('invalid json')
      mockSend.mockResolvedValueOnce(invokeModelInvalidResponse)
      const result = await parseJson(json, expectedFormat)

      expect(result).toBeUndefined()
      expect(jest.mocked(dynamodb).getPromptById).toHaveBeenCalledWith('fix-json')
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 256,
            messages: [{ content: formattingData, role: 'user' }],
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
})
