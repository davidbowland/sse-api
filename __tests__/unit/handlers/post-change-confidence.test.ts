import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { APIGatewayProxyEventV2, Session } from '@types'
import { confidenceChangeRequest, session, sessionId } from '../__mocks__'
import { confidenceChangedStep } from '@assets/conversation-steps'
import eventJson from '@events/post-change-confidence.json'
import { postChangeConfidenceHandler } from '@handlers/post-change-confidence'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-change-confidence', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const expectedResponse = {
    confidence: confidenceChangeRequest.confidence,
    dividers: { 0: { label: 'Introduction' }, 2: { label: 'Confidence change' } },
    newConversation: true,
    overrideStep: confidenceChangedStep,
  }
  const expectedSession: Session = {
    ...session,
    context: {
      ...session.context,
      confidence: confidenceChangeRequest.confidence,
    },
    dividers: { 0: { label: 'Introduction' }, 2: { label: 'Confidence change' } },
    newConversation: true,
    overrideStep: confidenceChangedStep,
    storedMessage: { content: 'Whatchu mean?', role: 'assistant' },
  }

  beforeAll(() => {
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(session)
    jest.mocked(events).extractConfidenceChangeRequest.mockReturnValue(confidenceChangeRequest)
  })

  describe('postChangeConfidenceHandler', () => {
    it('should update the confidence of the session and set the chat override', async () => {
      const result = await postChangeConfidenceHandler(event)

      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify(expectedResponse),
      })
      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })

    it('should return bad request on invalid session', async () => {
      jest.mocked(events).extractConfidenceChangeRequest.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postChangeConfidenceHandler({ ...event, body: JSON.stringify({}) })

      expect(result).toEqual(status.BAD_REQUEST)
    })

    it('should return NOT_FOUND when no session is found', async () => {
      jest.mocked(dynamodb).getSessionById.mockRejectedValueOnce(undefined)
      const result = await postChangeConfidenceHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    it('should return internal server error on save failure', async () => {
      jest.mocked(dynamodb).setSessionById.mockRejectedValueOnce(undefined)
      const result = await postChangeConfidenceHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
