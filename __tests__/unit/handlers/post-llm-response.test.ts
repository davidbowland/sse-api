import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { APIGatewayProxyEventV2, ChatMessage, Session } from '@types'
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
    currentStep: 'probe confidence',
    dividers: { '0': { label: 'Introduction' } },
    history: updatedSession.history,
    newConversation: false,
  }

  beforeAll(() => {
    jest.mocked(bedrock).invokeModelMessage.mockResolvedValue(llmResponse)
    jest.mocked(bedrock).parseJson.mockImplementation((json) => json)
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
      const sessionNoReason = { ...session, context: { ...session.context, generatedReasons: [] } }
      const expectedSession = {
        ...updatedSession,
        context: {
          ...updatedSession.context,
          generatedReasons: [
            'Military intervention causes more harm than good.',
            'The world would be more peaceful with less US military intervention.',
            'US military spending should be reduced.',
          ],
        },
      }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNoReason)
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(expectedResponse) })
    })

    it('returns only adds the assistant response to history for new conversations', async () => {
      const sessionNewConversation = { ...session, newConversation: true }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNewConversation)
      const expectedSession = {
        ...updatedSession,
        history: [...session.history, newAssistantMessage],
      }
      const newConversationResponse = {
        ...expectedResponse,
        history: expectedSession.history,
      }
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(newConversationResponse) })
    })

    it('moves on to next step', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionNewConversation = { ...session, currentStep: 'probe confidence' }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNewConversation)
      const expectedSession = {
        ...updatedSession,
        currentStep: 'probe reasons',
        dividers: { '0': { label: 'Introduction' }, '4': { label: 'Reasons' } },
        newConversation: true,
      }
      const newConversationResponse = {
        ...expectedResponse,
        currentStep: 'probe reasons',
        dividers: { '0': { label: 'Introduction' }, '4': { label: 'Reasons' } },
        history: expectedSession.history,
        newConversation: true,
      }
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(newConversationResponse) })
    })

    it("doesn't move on from final step", async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionNewConversation = { ...session, currentStep: 'end' }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNewConversation)
      const expectedSession = {
        ...updatedSession,
        currentStep: 'end',
        newConversation: true,
      }
      const newConversationResponse = {
        ...expectedResponse,
        currentStep: 'end',
        history: expectedSession.history,
        newConversation: true,
      }
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(newConversationResponse) })
    })

    it('add correct divider and restored saved message when override finishes', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const newMessage: ChatMessage = { content: 'Sup?', role: 'assistant' }
      const sessionWithMessage = {
        ...session,
        overrideStep: {
          label: 'Confidence change',
          path: '/new-confidence',
          value: 'confidence changed',
        },
        storedMessage: newMessage,
      }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionWithMessage)
      const expectedSession = {
        ...updatedSession,
        currentStep: 'probe confidence',
        dividers: { '0': { label: 'Introduction' }, '4': { label: 'Confidence' } },
        history: [...updatedSession.history, newMessage],
        newConversation: false,
      }
      const newConversationResponse = {
        ...expectedResponse,
        currentStep: expectedSession.currentStep,
        dividers: expectedSession.dividers,
        history: expectedSession.history,
        newConversation: expectedSession.newConversation,
      }
      const result = await postLlmResponseHandler(event)

      expect(jest.mocked(dynamodb).setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
      expect(result).toEqual({ ...status.OK, body: JSON.stringify(newConversationResponse) })
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
      jest.mocked(bedrock).invokeModelMessage.mockRejectedValueOnce(new Error('Rejected'))
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual(status.INTERNAL_SERVER_ERROR)
    })

    it('returns OK with message when the LLM returns undefined', async () => {
      const assistantErrorMessage = {
        content: "I'm sorry, but I had trouble generating a response. Would you please rephrase your last message?",
        role: 'assistant',
      }
      const expectedErrorResponse = {
        ...expectedResponse,
        history: [...session.history, userMessage, assistantErrorMessage],
        newConversation: false,
      }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(undefined)
      const result = await postLlmResponseHandler(event)

      expect(result).toEqual({ ...status.OK, body: JSON.stringify(expectedErrorResponse) })
    })
  })
})
