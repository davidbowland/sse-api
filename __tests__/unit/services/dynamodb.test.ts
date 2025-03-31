import { getPromptById, getSessionById, setSessionById } from '@services/dynamodb'
import { prompt, promptConfig, promptId, session, sessionId } from '../__mocks__'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDB: jest.fn(() => ({
    send: (...args) => mockSend(...args),
  })),
  GetItemCommand: jest.fn().mockImplementation((x) => x),
  PutItemCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('dynamodb', () => {
  describe('getPromptById', () => {
    it('should call DynamoDB and parse the prompt', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { Config: { S: JSON.stringify(promptConfig) }, SystemPrompt: { S: prompt.contents } },
      })

      const result = await getPromptById(promptId)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: {
            PromptId: { S: promptId },
          },
          TableName: 'prompt-table',
        }),
      )
      expect(result).toEqual(prompt)
    })
  })

  describe('getSessionById', () => {
    it('should call DynamoDB with the correct arguments', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { Data: { S: JSON.stringify(session) } },
      })

      const result = await getSessionById(sessionId)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: {
            SessionId: { S: sessionId },
          },
          TableName: 'session-table',
        }),
      )
      expect(result).toEqual(session)
    })
  })

  describe('setSessionById', () => {
    it('should call DynamoDB with the correct arguments', async () => {
      await setSessionById(sessionId, session)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          Item: {
            Data: {
              S: JSON.stringify(session),
            },
            Expiration: {
              N: `${session.expiration}`,
            },
            SessionId: {
              S: sessionId,
            },
          },
          TableName: 'session-table',
        }),
      )
    })
  })
})
