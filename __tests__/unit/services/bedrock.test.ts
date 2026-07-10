import {
  assistantLlmMessage,
  assistantLlmResponse,
  invokeModelInvalidResponse,
  invokeModelNoTextBlockResponse,
  invokeModelSuggestClaims,
  invokeModelSuggestClaimsResponse,
  invokeModelThinkingResponse,
  invokeModelToolUseInvalidResponse,
  invokeModelToolUseResponse,
  prompt,
  promptManualThinking,
  testResponseSchema,
  userLlmMessage,
} from '../__mocks__'
import { invokeModel, singleTurn } from '@services/bedrock'
import { LLMMessage } from '@types'
import { log, logDebug } from '@utils/logging'

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

const expectedTool = {
  name: testResponseSchema.toolName,
  description: testResponseSchema.toolDescription,
  input_schema: testResponseSchema.jsonSchema,
}

describe('bedrock', () => {
  const data = 'super-happy-fun-data'

  describe('singleTurn', () => {
    it('wraps content into a single user-role turn', () => {
      expect(singleTurn(data)).toEqual([{ content: data, role: 'user' }])
    })
  })

  describe('invokeModel', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue(invokeModelSuggestClaimsResponse)
    })

    it('should invoke the correct model based on the prompt', async () => {
      const result = await invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: [{ role: 'user', content: data }],
            system: prompt.contents,
            tools: [expectedTool],
            tool_choice: { type: 'auto' },
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should invoke the correct model with multi-turn history and stringify assistant content', async () => {
      const history: LLMMessage[] = [assistantLlmMessage, userLlmMessage]

      const result = await invokeModel(prompt, testResponseSchema, { history })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: [
              { role: 'assistant', content: JSON.stringify(assistantLlmResponse) },
              { role: 'user', content: userLlmMessage.content },
            ],
            system: prompt.contents,
            tools: [expectedTool],
            tool_choice: { type: 'auto' },
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should inject templateVars into the prompt when passed', async () => {
      const promptWithContext = {
        ...prompt,
        contents: 'My context should go here: ${context}',
      }
      const result = await invokeModel(promptWithContext, testResponseSchema, {
        history: singleTurn(data),
        templateVars: { foo: 'bar' },
      })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 50000,
            messages: [{ role: 'user', content: data }],
            system: 'My context should go here: {"foo":"bar"}',
            tools: [expectedTool],
            tool_choice: { type: 'auto' },
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
          }),
        ),
        contentType: 'application/json',
        modelId: 'us.anthropic.claude-sonnet-5',
      })
    })

    it('should use manual budget_tokens thinking for models that require it, with no output_config', async () => {
      const result = await invokeModel(promptManualThinking, testResponseSchema, { history: singleTurn(data) })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(mockSend).toHaveBeenCalledWith({
        body: new TextEncoder().encode(
          JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 1500,
            messages: [{ role: 'user', content: data }],
            system: promptManualThinking.contents,
            tools: [expectedTool],
            tool_choice: { type: 'auto' },
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
      await invokeModel(promptWithDisabledThinking, testResponseSchema, { history: singleTurn(data) })

      const lastBody = mockSend.mock.calls.at(-1)[0].body
      const sentBody = JSON.parse(new TextDecoder().decode(lastBody))
      expect(sentBody.thinking).toEqual({ type: 'disabled' })
      expect(sentBody.output_config).toBeUndefined()
    })

    it('should log the actual sent (capped) history length, not the raw input length', async () => {
      const longHistory: LLMMessage[] = Array.from({ length: 35 }, (_, i) => ({
        content: `message ${i}`,
        role: 'user' as const,
      }))

      await invokeModel(prompt, testResponseSchema, { history: longHistory })

      expect(log).toHaveBeenCalledWith('Invoking model', {
        historyLength: 30,
        model: prompt.config.model,
      })
    })

    it('should truncate history to the last 30 messages', async () => {
      const longHistory: LLMMessage[] = Array.from({ length: 35 }, (_, i) => ({
        content: `message ${i}`,
        role: 'user' as const,
      }))

      await invokeModel(prompt, testResponseSchema, { history: longHistory })

      const lastBody = mockSend.mock.calls.at(-1)[0].body
      const sentBody = JSON.parse(new TextDecoder().decode(lastBody))
      expect(sentBody.messages).toHaveLength(30)
      expect(sentBody.messages[0].content).toBe('message 5')
      expect(sentBody.messages[29].content).toBe('message 34')
    })

    it('should log only a minimal breadcrumb, never full prompt/history/response content, at non-debug level', async () => {
      const history: LLMMessage[] = [assistantLlmMessage, userLlmMessage]

      await invokeModel(prompt, testResponseSchema, { history })

      expect(log).toHaveBeenCalledWith('Invoking model', {
        historyLength: history.length,
        model: prompt.config.model,
      })
      expect(log).toHaveBeenCalledWith('Model response received', {
        model: prompt.config.model,
        stopReason: 'end_turn',
        textLength: expect.any(Number),
      })
      for (const call of (log as jest.Mock).mock.calls) {
        const [, payload] = call
        const serialized = JSON.stringify(payload ?? {})
        expect(serialized).not.toContain(prompt.contents)
        expect(serialized).not.toContain(invokeModelSuggestClaims[0])
      }
    })

    it('should throw when response contains no text block or tool use block', async () => {
      mockSend.mockResolvedValueOnce(invokeModelNoTextBlockResponse)

      await expect(invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })).rejects.toThrow(
        'Bedrock response contained no text block',
      )
    })

    it('should extract JSON from response with thinking block', async () => {
      mockSend.mockResolvedValueOnce(invokeModelThinkingResponse)

      const result = await invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })

      expect(result).toEqual({ suggestions: ['Claim A', 'Claim B'] })
    })

    it('should prefer a tool_use block over a text block when both are present', async () => {
      mockSend.mockResolvedValueOnce(invokeModelToolUseResponse)

      const result = await invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })

      expect(result).toEqual({ suggestions: ['Tool Claim A', 'Tool Claim B'] })
      expect(log).toHaveBeenCalledWith('Model response received via tool use', {
        model: prompt.config.model,
        toolName: testResponseSchema.toolName,
      })
      expect(log).not.toHaveBeenCalledWith(
        'Model replied without invoking the expected tool; falling back to text extraction',
        expect.anything(),
      )
    })

    it('should fall back to text extraction and log when the model does not invoke the tool', async () => {
      mockSend.mockResolvedValueOnce(invokeModelSuggestClaimsResponse)

      const result = await invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })

      expect(result).toEqual({ suggestions: invokeModelSuggestClaims })
      expect(log).toHaveBeenCalledWith(
        'Model replied without invoking the expected tool; falling back to text extraction',
        { model: prompt.config.model, toolName: testResponseSchema.toolName },
      )
    })

    it('should reject a tool_use response that fails schema validation, logging a truncated preview at production level and the full payload via logDebug', async () => {
      mockSend.mockResolvedValueOnce(invokeModelToolUseInvalidResponse)

      await expect(invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })).rejects.toThrow(
        `Model response failed schema validation for tool "${testResponseSchema.toolName}"`,
      )

      const [, prodPayload] = (log as jest.Mock).mock.calls.find(
        (call) => call[0] === 'Model response failed schema validation',
      )
      expect(prodPayload.parsedPreview.length).toBeLessThanOrEqual(500)
      expect(prodPayload.parsed).toBeUndefined()

      expect(logDebug).toHaveBeenCalledWith('Model response failed schema validation (full payload)', {
        parsed: { suggestions: 'not-an-array' },
        toolName: testResponseSchema.toolName,
      })
    })

    it('should reject a fallback text response that fails schema validation', async () => {
      mockSend.mockResolvedValueOnce(invokeModelThinkingResponse)
      const schemaRequiringExtraField = {
        ...testResponseSchema,
        jsonSchema: {
          type: 'object',
          properties: {
            suggestions: { type: 'array', items: { type: 'string' } },
            requiredButMissing: { type: 'string' },
          },
          required: ['suggestions', 'requiredButMissing'],
          additionalProperties: false,
        },
      }

      await expect(invokeModel(prompt, schemaRequiringExtraField, { history: singleTurn(data) })).rejects.toThrow(
        'Model response failed schema validation',
      )
    })

    it('should log a distinguishable message and rethrow when the fallback text is not valid JSON', async () => {
      mockSend.mockResolvedValueOnce(invokeModelInvalidResponse)

      await expect(invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })).rejects.toThrow()

      expect(log).toHaveBeenCalledWith('Failed to parse JSON from fallback text response', {
        message: expect.any(String),
        model: prompt.config.model,
        textLength: 'this-is-invalid-json'.length,
      })
    })

    it('should log a distinguishable message (including retry metadata) and rethrow when the Bedrock invocation itself fails', async () => {
      const bedrockError = Object.assign(new Error('Rate exceeded'), {
        $metadata: { attempts: 4, httpStatusCode: 429, requestId: 'req-123', totalRetryDelay: 7000 },
        name: 'ThrottlingException',
      })
      mockSend.mockRejectedValueOnce(bedrockError)

      await expect(invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })).rejects.toThrow(
        'Rate exceeded',
      )

      expect(log).toHaveBeenCalledWith('Bedrock invocation failed', {
        attempts: 4,
        errorName: 'ThrottlingException',
        httpStatusCode: 429,
        message: 'Rate exceeded',
        model: prompt.config.model,
        requestId: 'req-123',
        totalRetryDelay: 7000,
      })
    })

    it('should log a distinguishable message and rethrow when the response body is not valid JSON', async () => {
      mockSend.mockResolvedValueOnce({
        $metadata: { httpStatusCode: 200 },
        body: new TextEncoder().encode('not-json-at-all'),
      })

      await expect(invokeModel(prompt, testResponseSchema, { history: singleTurn(data) })).rejects.toThrow()

      expect(log).toHaveBeenCalledWith('Failed to parse Bedrock response body as JSON', {
        message: expect.any(String),
        model: prompt.config.model,
      })
    })
  })

  it('should construct the Bedrock client with an explicit retry budget', () => {
    // The client is a module-level singleton constructed once at import time, and clearMocks
    // wipes that call before any test body runs. jest.resetModules() also re-runs the
    // jest.mock() factory, producing a fresh BedrockRuntimeClient mock — re-require the mocked
    // SDK module itself to get the same instance bedrock.ts actually constructs against.
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const freshAwsSdk = require('@aws-sdk/client-bedrock-runtime')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@services/bedrock')
    expect(freshAwsSdk.BedrockRuntimeClient).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 4 }))
  })
})
