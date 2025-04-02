import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { APIGatewayProxyEventV2, Session } from '@types'
import { llmRequest, llmResponse, newAssistantMessage, prompt, session, sessionId, userMessage } from '../__mocks__'
import eventJson from '@events/post-llm-response.json'
import { postLlmResponseHandler } from '@handlers/post-llm-response'
import status from '@utils/status'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-llm-response', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const updatedSession: Session = {
    ...session,
    history: [...session.history, userMessage, newAssistantMessage],
  }
  const expectedResponse = {
    finished: false,
    history: updatedSession.history,
    reasons: updatedSession.context.reasons,
  }

  beforeAll(() => {
    jest.mocked(bedrock).invokeModelMessage.mockResolvedValue(llmResponse)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(session)
    jest.mocked(events).extractLlmRequestFromEvent.mockReturnValue(llmRequest)
  })

  describe('postLlmResponseHandler', () => {
    it('returns the response from the LLM', async () => {
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, updatedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(expectedResponse) })
    })

    it('returns the response from the LLM, no reason', async () => {
      const sessionNoReason = { ...session, context: { ...session.context, reasons: [] } }
      const expectedResponseNoReason = { ...expectedResponse, reasons: llmResponse.reasons }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNoReason)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify(expectedResponseNoReason) })
    })

    it('returns BAD_REQUEST when the event is invalid', async () => {
      jest.mocked(events).extractLlmRequestFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.BAD_REQUEST)
    })

    it('returns NOT_FOUND when the session is not found', async () => {
      jest.mocked(dynamodb).getSessionById.mockRejectedValueOnce(undefined)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    it('returns INTERNAL_SERVER_ERROR when the prompt is not found', async () => {
      jest.mocked(dynamodb).getPromptById.mockRejectedValueOnce(undefined)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('returns INTERNAL_SERVER_ERROR when the LLM rejects', async () => {
      jest.mocked(bedrock).invokeModelMessage.mockRejectedValueOnce(undefined)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
