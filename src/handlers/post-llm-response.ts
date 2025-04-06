import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ChatMessage, LLMResponse } from '../types'
import { getPromptById, getSessionById, setSessionById } from '../services/dynamodb'
import { invokeModelMessage, parseJson } from '../services/bedrock'
import { log, logError } from '../utils/logging'
import { extractLlmRequestFromEvent } from '../utils/events'
import { responsePromptId } from '../config'
import status from '../utils/status'

const PROMPT_OUTPUT_FORMAT = '{"finished": boolean, "message": string, "reasons": [string]}'

export const postLlmResponseHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string
  try {
    const llmRequest = extractLlmRequestFromEvent(event)
    try {
      const session = await getSessionById(sessionId)
      try {
        const prompt = await getPromptById(responsePromptId)
        const response: LLMResponse = (await parseJson(
          invokeModelMessage(prompt, [...session.history, llmRequest.message], {
            ...session.context,
            newConversation: llmRequest.newConversation,
          }),
          PROMPT_OUTPUT_FORMAT,
        )) ?? {
          finished: false,
          message: "I'm sorry, but I had trouble generating a response. Would you please rephrase your last message?",
        }

        const assistantMessage = { content: response.message, role: 'assistant' } as ChatMessage
        const newMessages = llmRequest.newConversation ? [assistantMessage] : [llmRequest.message, assistantMessage]
        const updatedSession = {
          ...session,
          context: {
            ...session.context,
            generatedReasons:
              session.context.generatedReasons.length === 0 && response.reasons
                ? response.reasons
                : session.context.generatedReasons,
          },
          history: [...session.history, ...newMessages],
        }
        await setSessionById(sessionId, updatedSession)

        return {
          ...status.OK,
          body: JSON.stringify({
            finished: response.finished,
            history: updatedSession.history,
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
