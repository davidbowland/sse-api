import { llmResponse, newAssistantMessage, prompt, session, sessionId, userMessage } from '../__mocks__'
import { llmResponseWorkerHandler } from '@handlers/llm-response-worker'
import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import { AssistantMessage, ChatMessage, Session, UserMessage } from '@types'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@utils/logging')

describe('llm-response-worker', () => {
  const promptId = 'probe-confidence'
  const workerEvent = { promptId, sessionId, userMessage }

  const questionSession: Session = {
    ...session,
    context: { ...session.context },
  }

  const updatedSession: Session = {
    ...session,
    context: { ...session.context },
    history: [...session.history, userMessage, newAssistantMessage],
    llmHistory: [
      ...session.llmHistory,
      userMessage as UserMessage,
      { content: llmResponse, role: 'assistant' } as AssistantMessage,
    ],
    loadingTimeout: undefined,
    question: session.question + 1,
  }

  const expectedConfidenceLevels = session.context.possibleConfidenceLevels.map((level) => level.label)

  beforeAll(() => {
    jest.mocked(bedrock).invokeModelMessage.mockResolvedValue(llmResponse)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(questionSession)
  })

  describe('llmResponseWorkerHandler', () => {
    const synthesizedMessage: UserMessage = {
      content:
        'I strongly agree with the claim "The Holy Roman Empire was neither Holy nor Roman nor an Empire.". Let\'s have a conversation about epistemology: Confidence.',
      role: 'user',
    }

    it('runs the full LLM cycle and saves the updated session', async () => {
      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, updatedSession)
    })

    it('clears loadingTimeout on the saved session', async () => {
      const sessionWithTimeout = { ...questionSession, loadingTimeout: Date.now() + 180_000 }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionWithTimeout)

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({ loadingTimeout: undefined }),
      )
    })

    it('passes correct arguments to invokeModelMessage', async () => {
      await llmResponseWorkerHandler(workerEvent)

      expect(bedrock.invokeModelMessage).toHaveBeenCalledWith(prompt, [...session.llmHistory, userMessage], {
        changedConfidence: undefined,
        claim: session.context.claim,
        confidence: session.context.confidence,
        generatedReasons: session.context.generatedReasons,
        incorrect_guesses: undefined,
        language: session.context.language,
        newConversation: false,
        possibleConfidenceLevels: expectedConfidenceLevels,
        question: updatedSession.question,
        storedMessage: session.storedMessage,
      })
    })

    it('synthesizes a first user message into the LLM call when newConversation is true', async () => {
      const sessionNewConversation = { ...questionSession, newConversation: true }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNewConversation)

      await llmResponseWorkerHandler(workerEvent)

      expect(bedrock.invokeModelMessage).toHaveBeenCalledWith(
        prompt,
        [...session.llmHistory, synthesizedMessage],
        expect.any(Object),
      )
    })

    it('returns only the assistant response in history for new conversations', async () => {
      const sessionNewConversation = { ...questionSession, newConversation: true }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNewConversation)
      const expectedSession = {
        ...updatedSession,
        history: [...session.history, newAssistantMessage],
        llmHistory: [
          ...session.llmHistory,
          synthesizedMessage,
          { content: llmResponse, role: 'assistant' } as AssistantMessage,
        ],
      }

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })

    it('populates generatedReasons when session has none and LLM returns reasons', async () => {
      const sessionNoReasons = { ...questionSession, context: { ...questionSession.context, generatedReasons: [] } }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionNoReasons)
      const expectedSession = {
        ...updatedSession,
        context: {
          ...updatedSession.context,
          generatedReasons: llmResponse.reasons,
        },
      }

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })

    it('saves fallback message and clears loadingTimeout when the LLM throws', async () => {
      jest.mocked(bedrock).invokeModelMessage.mockRejectedValueOnce(new Error('Bedrock error'))

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          loadingTimeout: undefined,
          history: expect.arrayContaining([
            expect.objectContaining({
              content: "I'm sorry, I had trouble generating a response. Would you please rephrase your last message?",
            }),
          ]),
        }),
      )
    })

    it('passes no question but incorrect guesses on guessing reasons', async () => {
      const sessionGuessReasons = { ...questionSession, currentStep: 'guess reasons' }
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionGuessReasons)

      await llmResponseWorkerHandler(workerEvent)

      expect(bedrock.invokeModelMessage).toHaveBeenCalledWith(prompt, [...session.llmHistory, userMessage], {
        claim: session.context.claim,
        confidence: session.context.confidence,
        generatedReasons: session.context.generatedReasons,
        incorrect_guesses: 0,
        language: session.context.language,
        newConversation: false,
        possibleConfidenceLevels: expectedConfidenceLevels,
        storedMessage: session.storedMessage,
      })
    })

    it('passes connect arguments to LLM on final step when confidence changed', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionFinalStep = { ...questionSession, currentStep: 'end' }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionFinalStep)

      await llmResponseWorkerHandler(workerEvent)

      expect(bedrock.invokeModelMessage).toHaveBeenCalledWith(prompt, [...session.llmHistory, userMessage], {
        changedConfidence: 'Changed confidence from agree to strongly agree',
        claim: session.context.claim,
        generatedReasons: session.context.generatedReasons,
        language: session.context.language,
        newConversation: false,
        possibleConfidenceLevels: expectedConfidenceLevels,
        question: updatedSession.question,
        storedMessage: session.storedMessage,
      })
    })

    it('passes connect arguments to LLM on final step when confidence unchanged', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionFinalStep = {
        ...questionSession,
        context: { ...session.context, confidence: 'disagree' },
        currentStep: 'end',
        originalConfidence: 'disagree',
      }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionFinalStep)

      await llmResponseWorkerHandler(workerEvent)

      expect(bedrock.invokeModelMessage).toHaveBeenCalledWith(prompt, [...session.llmHistory, userMessage], {
        changedConfidence: 'Kept confidence at disagree',
        claim: session.context.claim,
        generatedReasons: session.context.generatedReasons,
        language: session.context.language,
        newConversation: false,
        possibleConfidenceLevels: expectedConfidenceLevels,
        question: updatedSession.question,
        storedMessage: session.storedMessage,
      })
    })

    it("doesn't move on from final step", async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionFinalStep = { ...questionSession, currentStep: 'end' }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionFinalStep)
      const expectedSession = {
        ...updatedSession,
        currentStep: 'end',
        llmHistory: [
          ...session.llmHistory,
          userMessage as UserMessage,
          { content: finishedLlmResponse, role: 'assistant' } as AssistantMessage,
        ],
        newConversation: true,
        question: 0,
      }

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })

    it('adds correct divider when override finishes', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const newMessage: ChatMessage = { content: 'Sup?', role: 'assistant' }
      const sessionWithOverride = {
        ...questionSession,
        overrideStep: {
          label: 'Confidence change',
          path: '/new-confidence',
          value: 'confidence changed',
        },
        storedMessage: newMessage,
      }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionWithOverride)
      const expectedSession = {
        ...updatedSession,
        currentStep: 'probe confidence',
        dividers: { '0': { label: 'Introduction' }, '4': { label: 'Confidence' } },
        llmHistory: [
          ...session.llmHistory,
          userMessage as UserMessage,
          { content: finishedLlmResponse, role: 'assistant' } as AssistantMessage,
        ],
        newConversation: false,
        question: 1,
      }

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })

    it('moves on to next step when response is finished', async () => {
      const finishedLlmResponse = { ...llmResponse, finished: true }
      const sessionProbe = { ...questionSession, currentStep: 'probe confidence' }
      jest.mocked(bedrock).invokeModelMessage.mockResolvedValueOnce(finishedLlmResponse)
      jest.mocked(dynamodb).getSessionById.mockResolvedValueOnce(sessionProbe)
      const expectedSession = {
        ...updatedSession,
        context: { ...session.context },
        currentStep: 'probe reasons',
        dividers: { '0': { label: 'Introduction' }, '4': { label: 'Reasons' } },
        llmHistory: [
          ...session.llmHistory,
          userMessage as UserMessage,
          { content: finishedLlmResponse, role: 'assistant' } as AssistantMessage,
        ],
        newConversation: true,
        question: 0,
      }

      await llmResponseWorkerHandler(workerEvent)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, expectedSession)
    })
  })
})
