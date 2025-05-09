import { responsePromptId } from '../config'
import { invokeModelMessage, parseJson } from '../services/bedrock'
import { getPromptById, getSessionById, setSessionById } from '../services/dynamodb'
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  ChatMessage,
  ConversationStep,
  LLMResponse,
  Session,
} from '../types'
import { extractLlmRequestFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

const PROMPT_OUTPUT_FORMAT = '{"finished": false, "message": string, "reasons": [string]}'

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

export const postLlmResponseHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string
  try {
    const llmRequest = extractLlmRequestFromEvent(event)
    try {
      const session = await getSessionById(sessionId)
      try {
        const prompt = await getPromptById(responsePromptId)
        const currentStepIndex = session.conversationSteps.findIndex((step) => step.value === session.currentStep)
        const currentStepObject = session.conversationSteps[currentStepIndex]
        const nextStepObject = session.conversationSteps[currentStepIndex + 1]
        const changedConfidence =
          session.context.confidence === session.originalConfidence
            ? `Kept confidence at ${session.originalConfidence}`
            : `Changed confidence from ${session.originalConfidence} to ${session.context.confidence}`

        const response: LLMResponse = (await parseJson(
          invokeModelMessage(prompt, [...session.history, llmRequest.message], {
            ...session.context,
            changedConfidence: currentStepObject.isFinalStep ? changedConfidence : undefined,
            confidence: currentStepObject.isFinalStep ? undefined : session.context.confidence,
            newConversation: session.newConversation,
            possibleConfidenceLevels: session.context.possibleConfidenceLevels.map((level) => level.label),
            storedMessage: session.storedMessage,
          }),
          PROMPT_OUTPUT_FORMAT,
        )) ?? {
          finished: false,
          message: "I'm sorry, but I had trouble generating a response. Would you please rephrase your last message?",
        }

        const assistantMessage = { content: response.message, role: 'assistant' } as ChatMessage
        const newMessages = session.newConversation ? [assistantMessage] : [llmRequest.message, assistantMessage]
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
            storedMessage: undefined,
          }
          : {
            newConversation: false,
          }

        const updatedSession: Session = {
          ...session,
          ...finishedSession,
          context: {
            ...session.context,
            generatedReasons: newGeneratedReasons,
          },
          history: newHistory,
        }
        await setSessionById(sessionId, updatedSession)

        return {
          ...status.OK,
          body: JSON.stringify({
            currentStep: updatedSession.currentStep,
            dividers: updatedSession.dividers,
            history: updatedSession.history,
            newConversation: updatedSession.newConversation,
            overrideStep: updatedSession.overrideStep,
          }),
        }
      } catch (error: any) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: any) {
      return status.NOT_FOUND
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
