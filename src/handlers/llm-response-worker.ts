import { invokeModelMessage } from '../services/bedrock'
import { getPromptById, getSessionById, setSessionById } from '../services/dynamodb'
import {
  AssistantMessage,
  ChatMessage,
  ConversationStep,
  LLMMessage,
  LLMResponse,
  Session,
  UserMessage,
} from '../types'
import { log, logError } from '../utils/logging'

const getDividers = (
  session: Session,
  currentStepObject: ConversationStep,
  nextStepObject: ConversationStep,
  history: ChatMessage[],
) => {
  if (session.overrideStep) {
    return { ...session.dividers, [history.length]: { label: currentStepObject?.label } }
  } else if (currentStepObject.isFinalStep) {
    return session.dividers
  }
  return { ...session.dividers, [history.length]: { label: nextStepObject?.label } }
}

interface WorkerEvent {
  promptId: string
  sessionId: string
  userMessage: ChatMessage
}

export const llmResponseWorkerHandler = async (event: WorkerEvent): Promise<void> => {
  const { promptId, sessionId, userMessage } = event
  log('Worker received event', { promptId, sessionId })
  const session = await getSessionById(sessionId)
  const prompt = await getPromptById(promptId)

  const currentStepIndex = session.conversationSteps.findIndex((step) => step.value === session.currentStep)
  const currentStepObject = session.conversationSteps[currentStepIndex]
  const nextStepObject = session.conversationSteps[currentStepIndex + 1]
  const changedConfidence =
    session.context.confidence === session.originalConfidence
      ? `Kept confidence at ${session.originalConfidence}`
      : `Changed confidence from ${session.originalConfidence} to ${session.context.confidence}`
  const currentQuestion =
    currentStepObject.value === 'guess reasons' || currentStepObject.value === 'confidence changed'
      ? undefined
      : session.question + 1

  const llmContext = {
    ...session.context,
    changedConfidence: currentStepObject.isFinalStep ? changedConfidence : undefined,
    confidence: currentStepObject.isFinalStep ? undefined : session.context.confidence,
    incorrect_guesses: currentStepObject.value === 'guess reasons' ? session.incorrect_guesses : undefined,
    newConversation: session.newConversation,
    possibleConfidenceLevels: session.context.possibleConfidenceLevels.map((level) => level.label),
    question: currentQuestion,
    storedMessage: session.storedMessage,
  }

  const currentLlmMessage: UserMessage = session.newConversation
    ? {
      content: `I ${session.context.confidence} with the claim "${session.context.claim}". Let's have a conversation about epistemology: ${currentStepObject.label}.`,
      role: 'user',
    }
    : (userMessage as UserMessage)

  const response = await invokeModelMessage<LLMResponse>(
    prompt,
    [...(session.llmHistory ?? []), currentLlmMessage],
    llmContext,
  ).catch((error: unknown) => {
    logError(error)
    return {
      finished: false,
      message: "I'm sorry, I had trouble generating a response. Would you please rephrase your last message?",
    } as LLMResponse
  })

  const newLlmHistory: LLMMessage[] = [
    ...(session.llmHistory ?? []),
    currentLlmMessage,
    { content: response, role: 'assistant' } as AssistantMessage,
  ]
  const assistantMessage = { content: response.message, role: 'assistant' } as ChatMessage
  const newMessages = session.newConversation ? [assistantMessage] : [userMessage, assistantMessage]
  const newHistory = [...session.history, ...newMessages]

  const newGeneratedReasons =
    session.context.generatedReasons.length === 0 && response.reasons
      ? response.reasons
      : session.context.generatedReasons

  const finishedSession = response.finished
    ? {
      currentStep:
          !session.overrideStep && !currentStepObject.isFinalStep ? nextStepObject.value : session.currentStep,
      dividers: getDividers(session, currentStepObject, nextStepObject, newHistory),
      newConversation: !session.overrideStep,
      overrideStep: undefined,
      question: session.overrideStep ? session.question : Math.max(0, session.question - 1),
      storedMessage: undefined,
    }
    : {
      newConversation: false,
      question: currentQuestion === undefined ? session.question : currentQuestion,
    }

  const updatedSession: Session = {
    ...session,
    ...finishedSession,
    context: {
      ...session.context,
      generatedReasons: newGeneratedReasons,
    },
    history: newHistory,
    incorrect_guesses:
      currentStepObject.value === 'guess reasons' && !response.correct ? session.incorrect_guesses + 1 : 0,
    llmHistory: newLlmHistory,
    loadingTimeout: undefined,
  }

  await setSessionById(sessionId, updatedSession)
  log('Worker completed', { sessionId })
}
