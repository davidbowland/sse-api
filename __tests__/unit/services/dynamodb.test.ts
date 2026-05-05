import { prompt, promptConfig, promptId, session, sessionId } from '../__mocks__'
import {
  deleteGeneratingSuggestClaims,
  getLatestSuggestClaims,
  getPromptById,
  getSessionById,
  getSessionsByUserId,
  setGeneratingSuggestClaims,
  setSessionById,
  setSuggestClaims,
  VersionConflictError,
} from '@services/dynamodb'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-dynamodb', () => ({
  ...jest.requireActual('@aws-sdk/client-dynamodb'),
  DeleteItemCommand: jest.fn().mockImplementation((x) => x),
  DynamoDB: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  GetItemCommand: jest.fn().mockImplementation((x) => x),
  PutItemCommand: jest.fn().mockImplementation((x) => x),
  QueryCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('dynamodb', () => {
  describe('getPromptById', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue({
        Items: [{ Config: { S: JSON.stringify(promptConfig) }, SystemPrompt: { S: prompt.contents } }],
      })
    })

    it('should call DynamoDB and parse the prompt', async () => {
      const result = await getPromptById(promptId)

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeValues: { ':promptId': { S: `${promptId}` } },
        KeyConditionExpression: 'PromptId = :promptId',
        Limit: 1,
        ScanIndexForward: false,
        TableName: 'prompt-table',
      })
      expect(result).toEqual(prompt)
    })
  })

  describe('getSessionById', () => {
    beforeAll(() => {
      mockSend.mockResolvedValue({
        Item: {
          Claim: { S: session.context.claim },
          Confidence: { S: session.context.confidence },
          ConversationSteps: { S: JSON.stringify(session.conversationSteps) },
          CurrentStep: { S: session.currentStep },
          Dividers: { S: JSON.stringify(session.dividers) },
          Expiration: { N: `${session.expiration}` },
          GeneratedReasons: { S: JSON.stringify(session.context.generatedReasons) },
          History: { S: JSON.stringify(session.history) },
          IncorrectGuesses: { N: `${session.incorrect_guesses}` },
          Language: { S: session.context.language },
          LlmHistory: { S: JSON.stringify(session.llmHistory) },
          NewConversation: { BOOL: session.newConversation },
          OriginalConfidence: { S: session.originalConfidence },
          PossibleConfidenceLevels: { S: JSON.stringify(session.context.possibleConfidenceLevels) },
          Question: { N: `${session.question}` },
          SessionId: { S: sessionId },
          Version: { N: `${session.version}` },
        },
      })
    })

    it('should call DynamoDB with the correct arguments and reconstruct session', async () => {
      const result = await getSessionById(sessionId)

      expect(mockSend).toHaveBeenCalledWith({
        Key: {
          SessionId: { S: sessionId },
        },
        TableName: 'session-table',
      })
      expect(result).toEqual(session)
    })
  })

  describe('setSessionById', () => {
    it('should write session fields as individual columns with version increment', async () => {
      await setSessionById(sessionId, session)

      const call = mockSend.mock.calls[mockSend.mock.calls.length - 1][0]
      expect(call.Item.Version).toEqual({ N: `${session.version + 1}` })
      expect(call.Item.Claim).toEqual({ S: session.context.claim })
      expect(call.Item.Confidence).toEqual({ S: session.context.confidence })
      expect(call.Item.SessionId).toEqual({ S: sessionId })
      expect(call.Item.UpdatedAt.N).toBeDefined()
      expect(call.ConditionExpression).toBe('Version = :expectedVersion')
      expect(call.ExpressionAttributeValues).toEqual({ ':expectedVersion': { N: `${session.version}` } })
      expect(call.TableName).toBe('session-table')
    })

    it('should use attribute_not_exists for new sessions (version 0)', async () => {
      const newSession = { ...session, version: 0 }
      await setSessionById(sessionId, newSession)

      const call = mockSend.mock.calls[mockSend.mock.calls.length - 1][0]
      expect(call.Item.Version).toEqual({ N: '1' })
      expect(call.ConditionExpression).toBe('attribute_not_exists(SessionId)')
      expect(call.ExpressionAttributeValues).toBeUndefined()
    })

    it('should include UserId when session has userId', async () => {
      const sessionWithUser = { ...session, userId: 'google-user-123' }
      await setSessionById(sessionId, sessionWithUser)

      const call = mockSend.mock.calls[mockSend.mock.calls.length - 1][0]
      expect(call.Item.UserId).toEqual({ S: 'google-user-123' })
    })

    it('should throw VersionConflictError on conditional check failure', async () => {
      const { ConditionalCheckFailedException } = jest.requireActual('@aws-sdk/client-dynamodb')
      mockSend.mockRejectedValueOnce(new ConditionalCheckFailedException({ message: 'fail', $metadata: {} }))

      await expect(setSessionById(sessionId, session)).rejects.toThrow(VersionConflictError)
    })

    it('should rethrow non-conflict errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'))

      await expect(setSessionById(sessionId, session)).rejects.toThrow('Network error')
    })
  })

  describe('getSessionsByUserId', () => {
    it('should query the GSI and return session summaries', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            Claim: { S: 'Test claim' },
            Confidence: { S: 'agree' },
            SessionId: { S: 'abc123' },
            UpdatedAt: { N: '1713200000' },
          },
        ],
      })

      const result = await getSessionsByUserId('user-456')

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeValues: { ':userId': { S: 'user-456' } },
        IndexName: 'UserId-UpdatedAt-index',
        KeyConditionExpression: 'UserId = :userId',
        ProjectionExpression: 'SessionId, Claim, Confidence, UpdatedAt',
        ScanIndexForward: false,
        TableName: 'session-table',
      })
      expect(result).toEqual([{ claim: 'Test claim', confidence: 'agree', sessionId: 'abc123', updatedAt: 1713200000 }])
    })

    it('should return empty array when no items exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] })

      const result = await getSessionsByUserId('user-789')

      expect(result).toEqual([])
    })
  })

  describe('getLatestSuggestClaims', () => {
    const dateKey = '2026-04-15#en-US'
    const claims = ['Claim A', 'Claim B']

    it('should return the latest record when items exist', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            CreatedAt: { N: '1713200000' },
            Data: { S: JSON.stringify(claims) },
            Generating: { BOOL: false },
            Language: { S: 'en-US' },
          },
        ],
      })

      const result = await getLatestSuggestClaims(dateKey)

      expect(mockSend).toHaveBeenCalledWith({
        ExpressionAttributeValues: { ':dateKey': { S: dateKey } },
        KeyConditionExpression: 'DateKey = :dateKey',
        Limit: 1,
        ScanIndexForward: false,
        TableName: 'suggest-claims-table',
      })
      expect(result).toEqual({ claims, createdAt: 1713200000, generating: false, language: 'en-US' })
    })

    it('should return a generating record without claims', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            CreatedAt: { N: '1713200000' },
            Generating: { BOOL: true },
            Language: { S: 'en-US' },
          },
        ],
      })

      const result = await getLatestSuggestClaims(dateKey)

      expect(result).toEqual({ claims: undefined, createdAt: 1713200000, generating: true, language: 'en-US' })
    })

    it('should return undefined when no items exist', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] })

      const result = await getLatestSuggestClaims(dateKey)

      expect(result).toBeUndefined()
    })

    it('should return undefined when Items is undefined', async () => {
      mockSend.mockResolvedValueOnce({ Items: undefined })

      const result = await getLatestSuggestClaims(dateKey)

      expect(result).toBeUndefined()
    })
  })

  describe('setGeneratingSuggestClaims', () => {
    const dateKey = '2026-04-15#en-US'

    it('should write a generating placeholder and return createdAt', async () => {
      const before = Math.floor(Date.now() / 1000)
      const createdAt = await setGeneratingSuggestClaims(dateKey, 'en-US')
      const after = Math.floor(Date.now() / 1000)

      expect(createdAt).toBeGreaterThanOrEqual(before)
      expect(createdAt).toBeLessThanOrEqual(after)

      const call = mockSend.mock.calls[mockSend.mock.calls.length - 1][0]
      expect(call.Item.DateKey).toEqual({ S: dateKey })
      expect(call.Item.Generating).toEqual({ BOOL: true })
      expect(call.Item.Language).toEqual({ S: 'en-US' })
      expect(call.Item.Data).toBeUndefined()
      expect(call.Item.CreatedAt).toEqual({ N: `${createdAt}` })
      expect(call.TableName).toBe('suggest-claims-table')
    })
  })

  describe('deleteGeneratingSuggestClaims', () => {
    const dateKey = '2026-04-15#en-US'
    const createdAt = 1713200000

    it('should delete the record by composite key', async () => {
      await deleteGeneratingSuggestClaims(dateKey, createdAt)

      expect(mockSend).toHaveBeenCalledWith({
        Key: {
          CreatedAt: { N: `${createdAt}` },
          DateKey: { S: dateKey },
        },
        TableName: 'suggest-claims-table',
      })
    })
  })

  describe('setSuggestClaims', () => {
    const dateKey = '2026-04-15#en-US'
    const claims = ['Claim A', 'Claim B']
    const createdAt = 1713200000

    it('should call DynamoDB with the correct arguments', async () => {
      await setSuggestClaims(dateKey, createdAt, claims, 'en-US')

      const call = mockSend.mock.calls[mockSend.mock.calls.length - 1][0]
      expect(call.Item.DateKey).toEqual({ S: dateKey })
      expect(call.Item.CreatedAt).toEqual({ N: `${createdAt}` })
      expect(call.Item.Data).toEqual({ S: JSON.stringify(claims) })
      expect(call.Item.Generating).toEqual({ BOOL: false })
      expect(call.Item.Language).toEqual({ S: 'en-US' })
      expect(call.Item.Expiration).toEqual({ N: `${createdAt + 30 * 24 * 60 * 60}` })
      expect(call.TableName).toBe('suggest-claims-table')
    })
  })
})
