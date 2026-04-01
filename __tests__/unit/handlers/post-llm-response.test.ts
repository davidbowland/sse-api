import { llmRequest, session, sessionId, userMessage } from '../__mocks__'
import eventJson from '@events/post-llm-response.json'
import { postLlmResponseHandler } from '@handlers/post-llm-response'
import * as dynamodb from '@services/dynamodb'
import * as lambda from '@services/lambda'
import { APIGatewayProxyEventV2, Session } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@config', () => ({
  responsePromptId: 'probe-confidence',
  workerFunctionArn: 'arn:aws:lambda:us-east-1:123456789:function:worker',
}))
jest.mock('@services/dynamodb')
jest.mock('@services/lambda')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-llm-response', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2
  const responsePromptId = 'probe-confidence'
  const workerFunctionArn = 'arn:aws:lambda:us-east-1:123456789:function:worker'

  const questionSession: Session = {
    ...session,
    context: { ...session.context },
  }

  beforeAll(() => {
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(questionSession)
    jest.mocked(events).extractLlmRequestFromEvent.mockReturnValue(llmRequest)
    jest.mocked(lambda).invokeLambda.mockResolvedValue(undefined)
  })

  describe('postLlmResponseHandler', () => {
    it('sets loadingTimeout on the session before invoking worker', async () => {
      const before = Date.now()
      await postLlmResponseHandler(event)
      const after = Date.now()

      const savedSession = jest.mocked(dynamodb).setSessionById.mock.calls[0][1] as Session
      expect(savedSession.loadingTimeout).toBeGreaterThanOrEqual(before + 180_000)
      expect(savedSession.loadingTimeout).toBeLessThanOrEqual(after + 180_000)
    })

    it('saves session before invoking worker', async () => {
      const callOrder: string[] = []
      jest.mocked(dynamodb).setSessionById.mockImplementationOnce(async () => {
        callOrder.push('setSession')
      })
      jest.mocked(lambda).invokeLambda.mockImplementationOnce(async () => {
        callOrder.push('invokeLambda')
      })

      await postLlmResponseHandler(event)

      expect(callOrder).toEqual(['setSession', 'invokeLambda'])
    })

    it('invokes worker with correct sessionId, promptId, and userMessage', async () => {
      await postLlmResponseHandler(event)

      expect(lambda.invokeLambda).toHaveBeenCalledWith(workerFunctionArn, {
        promptId: responsePromptId,
        sessionId,
        userMessage,
      })
    })

    it('returns session state with loadingTimeout', async () => {
      const result = await postLlmResponseHandler(event)
      const body = JSON.parse((result as { body: string }).body)

      expect(body).toMatchObject({
        currentStep: questionSession.currentStep,
        dividers: questionSession.dividers,
        history: questionSession.history,
        newConversation: questionSession.newConversation,
      })
      expect(body.loadingTimeout).toBeGreaterThan(Date.now())
    })

    it('returns BAD_REQUEST when the event is invalid', async () => {
      jest.mocked(events).extractLlmRequestFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual({ ...status.BAD_REQUEST, body: JSON.stringify({ message: 'Bad request' }) })
    })

    it('returns NOT_FOUND when the session is not found', async () => {
      jest.mocked(dynamodb).getSessionById.mockRejectedValueOnce(undefined)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })

    it('returns INTERNAL_SERVER_ERROR when setSession fails', async () => {
      jest.mocked(dynamodb).setSessionById.mockRejectedValueOnce(new Error('DynamoDB error'))
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })
  })
})
