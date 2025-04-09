import { getPromptById, getSessionById, setSessionById } from '@services/dynamodb'
import { prompt, promptConfig, promptId, session, sessionId } from '../__mocks__'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-dynamodb', () => ({
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
        Item: { Data: { S: JSON.stringify(session) } },
      })
    })

    it('should call DynamoDB with the correct arguments', async () => {
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
    it('should call DynamoDB with the correct arguments', async () => {
      await setSessionById(sessionId, session)

      expect(mockSend).toHaveBeenCalledWith({
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
      })
    })
  })
})
