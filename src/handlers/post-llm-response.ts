import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ChatMessage, LLMResponse, Session } from '../types'
import { getPromptById, getSessionById, setSessionById } from '../services/dynamodb'
import { invokeModelMessage, parseJson } from '../services/bedrock'
import { log, logError } from '../utils/logging'
import { extractLlmRequestFromEvent } from '../utils/events'
import { responsePromptId } from '../config'
import status from '../utils/status'

const PROMPT_OUTPUT_FORMAT = '{"finished": false, "message": string, "reasons": [string]}'

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

        const response: LLMResponse = (await parseJson(
          invokeModelMessage(prompt, [...session.history, llmRequest.message], {
            ...session.context,
            newConversation: session.newConversation,
            originalConfidence: currentStepObject.isFinalStep ? session.originalConfidence : undefined,
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

        const newDividers =
          response.finished && !currentStepObject.isFinalStep
            ? { ...session.dividers, [newHistory.length]: { label: nextStepObject?.label } }
            : session.dividers

        const newCurrentStep =
          response.finished && !session.overrideStep && !currentStepObject.isFinalStep
            ? nextStepObject.value
            : session.currentStep

        const updatedSession: Session = {
          ...session,
          context: {
            ...session.context,
            generatedReasons: newGeneratedReasons,
          },
          currentStep: newCurrentStep,
          dividers:
            response.finished && session.overrideStep
              ? { ...session.dividers, [newHistory.length]: { label: currentStepObject?.label } }
              : newDividers,
          history: newHistory,
          newConversation: response.finished && !session.overrideStep,
          overrideStep: response.finished ? undefined : session.overrideStep,
          storedMessage: response.finished ? undefined : session.storedMessage,
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
