import { newSession, prompt, sessionId, validationResult } from '../__mocks__'
import eventJson from '@events/post-session.json'
import { postSessionHandler } from '@handlers/post-session'
import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import * as idGenerator from '@utils/id-generator'
import status from '@utils/status'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@utils/id-generator')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-session', () => {
  const epochTime = 1742760571384
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(bedrock).invokeModel.mockResolvedValue(validationResult)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(events).extractSessionFromEvent.mockReturnValue(newSession)
    jest.mocked(idGenerator).getNextId.mockResolvedValue(sessionId)

    Date.now = () => epochTime
  })

  describe('postSessionHandler', () => {
    it('should validate claim and save new session and return session ID', async () => {
      const result = await postSessionHandler(event)

      expect(bedrock.invokeModel).toHaveBeenCalledWith(prompt, newSession.context.claim, {
        language: newSession.context.language,
      })
      expect(result).toEqual({
        ...status.CREATED,
        body: JSON.stringify({ sessionId }),
      })
      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, newSession)
    })

    it('should return bad request when claim is inappropriate', async () => {
      const inappropriateValidation = { ...validationResult, inappropriate: true }
      jest.mocked(bedrock).invokeModel.mockResolvedValueOnce(inappropriateValidation)

      const result = await postSessionHandler(event)

      expect(result).toEqual({
        ...status.BAD_REQUEST,
        body: JSON.stringify({ message: 'Inappropriate claim content' }),
      })
      expect(dynamodb.setSessionById).not.toHaveBeenCalled()
    })

    it('should return bad request on invalid session', async () => {
      jest.mocked(events).extractSessionFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postSessionHandler({ ...event, body: JSON.stringify({}) })

      expect(result).toEqual(status.BAD_REQUEST)
    })

    it('should return internal server error when prompt retrieval fails', async () => {
      jest.mocked(dynamodb).getPromptById.mockRejectedValueOnce(new Error('Prompt not found'))
      const result = await postSessionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return internal server error when validation fails', async () => {
      jest.mocked(bedrock).invokeModel.mockRejectedValueOnce(new Error('Validation failed'))
      const result = await postSessionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('should return internal server error on save failure', async () => {
      jest.mocked(dynamodb).setSessionById.mockRejectedValueOnce(undefined)
      const result = await postSessionHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
