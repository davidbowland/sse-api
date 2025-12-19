import { session, sessionId, transcribeStreamingResponse } from '../__mocks__'
import eventJson from '@events/post-transcribe-streaming.json'
import { postTranscribeStreamingHandler } from '@handlers/post-transcribe-streaming'
import * as dynamodb from '@services/dynamodb'
import * as transcribe from '@services/transcribe'
import { APIGatewayProxyEventV2 } from '@types'
import status from '@utils/status'

jest.mock('@services/dynamodb')
jest.mock('@services/transcribe')
jest.mock('@utils/logging')

describe('post-transcribe-streaming', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(session)
    jest.mocked(transcribe).createStreamingSession.mockResolvedValue(transcribeStreamingResponse)
  })

  describe('postTranscribeStreamingHandler', () => {
    it('should return streaming session for valid session', async () => {
      const result = await postTranscribeStreamingHandler(event)

      expect(dynamodb.getSessionById).toHaveBeenCalledWith(sessionId)
      expect(transcribe.createStreamingSession).toHaveBeenCalledWith(sessionId, 'en-US', 16000, 'pcm')
      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify(transcribeStreamingResponse),
      })
    })

    it('should return NOT_FOUND when session does not exist', async () => {
      jest.mocked(dynamodb).getSessionById.mockRejectedValueOnce(new Error('Session not found'))
      const result = await postTranscribeStreamingHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    it('should return INTERNAL_SERVER_ERROR for service failures', async () => {
      jest.mocked(transcribe).createStreamingSession.mockRejectedValueOnce(new Error('Service unavailable'))
      const result = await postTranscribeStreamingHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
