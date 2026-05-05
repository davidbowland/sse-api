import { getUserSessionsHandler } from '@handlers/get-user-sessions'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2, SessionSummary } from '@types'
import * as auth from '@utils/auth'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/auth')
jest.mock('@utils/logging')

describe('get-user-sessions', () => {
  const event = {
    headers: { authorization: 'Bearer valid-token' },
    requestContext: {
      authorizer: { jwt: { claims: { sub: 'user-123', name: 'Test User' } } },
    },
  } as unknown as APIGatewayProxyEventV2

  const sessionSummaries: SessionSummary[] = [
    { claim: 'The earth is flat', confidence: 'strongly disagree', sessionId: 'abc123', updatedAt: 1713200000 },
    { claim: 'Cats are better than dogs', confidence: 'agree', sessionId: 'def456', updatedAt: 1713100000 },
  ]

  beforeAll(() => {
    jest.mocked(auth).extractAuthContext.mockReturnValue({
      isAuthenticated: true,
      googleSub: 'user-123',
      googleName: 'Test User',
      tokenPresent: true,
    })
    jest.mocked(dynamodb).getSessionsByUserId.mockResolvedValue(sessionSummaries)
  })

  describe('getUserSessionsHandler', () => {
    it('should return sessions for authenticated user', async () => {
      const result = await getUserSessionsHandler(event)

      expect(dynamodb.getSessionsByUserId).toHaveBeenCalledWith('user-123')
      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify(sessionSummaries),
      })
    })

    it('should return 401 when not authenticated', async () => {
      jest
        .mocked(auth)
        .extractAuthContext.mockReturnValueOnce({ isAuthenticated: false, googleSub: null, tokenPresent: false })

      const result = await getUserSessionsHandler(event)

      expect(result).toEqual({
        ...status.UNAUTHORIZED,
        body: JSON.stringify({ message: 'Valid authentication required' }),
      })
      expect(dynamodb.getSessionsByUserId).not.toHaveBeenCalled()
    })

    it('should return 401 when authenticated but no sub claim', async () => {
      jest
        .mocked(auth)
        .extractAuthContext.mockReturnValueOnce({ isAuthenticated: true, googleSub: null, tokenPresent: true })

      const result = await getUserSessionsHandler(event)

      expect(result).toEqual({
        ...status.UNAUTHORIZED,
        body: JSON.stringify({ message: 'Valid authentication required' }),
      })
    })

    it('should return internal server error on DynamoDB failure', async () => {
      jest.mocked(dynamodb).getSessionsByUserId.mockRejectedValueOnce(new Error('DynamoDB error'))

      const result = await getUserSessionsHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
