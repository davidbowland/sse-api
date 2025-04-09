import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import * as idGenerator from '@utils/id-generator'
import { newSession, sessionId } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/post-session.json'
import { postSessionHandler } from '@handlers/post-session'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/id-generator')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-session', () => {
  const epochTime = 1742760571384
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(events).extractSessionFromEvent.mockReturnValue(newSession)
    jest.mocked(idGenerator).getNextId.mockResolvedValue(sessionId)

    Date.now = () => epochTime
  })

  describe('postSessionHandler', () => {
    it('should save new session and return session ID', async () => {
      const result = await postSessionHandler(event)

      expect(result).toEqual({
        ...status.CREATED,
        body: JSON.stringify({ sessionId }),
      })
      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, newSession)
    })

    it('should return bad request on invalid session', async () => {
      jest.mocked(events).extractSessionFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postSessionHandler({ ...event, body: JSON.stringify({}) })

      expect(result).toEqual(status.BAD_REQUEST)
    })

    it('should return internal server error on save failure', async () => {
      jest.mocked(dynamodb).setSessionById.mockRejectedValueOnce(undefined)
      const result = await postSessionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
