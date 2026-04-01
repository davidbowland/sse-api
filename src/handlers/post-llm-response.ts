import { workerFunctionArn, responsePromptId } from '../config'
import { getSessionById, setSessionById } from '../services/dynamodb'
import { invokeLambda } from '../services/lambda'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Session } from '../types'
import { extractLlmRequestFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postLlmResponseHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string
  try {
    const llmRequest = extractLlmRequestFromEvent(event)
    try {
      const session = await getSessionById(sessionId)
      try {
        const loadingTimeout = Date.now() + 180_000
        const updatedSession: Session = { ...session, loadingTimeout }
        await setSessionById(sessionId, updatedSession)
        await invokeLambda(workerFunctionArn, {
          promptId: responsePromptId,
          sessionId,
          userMessage: llmRequest.message,
        })
        return {
          ...status.OK,
          body: JSON.stringify({
            currentStep: session.currentStep,
            dividers: session.dividers,
            history: session.history,
            loadingTimeout,
            newConversation: session.newConversation,
            overrideStep: session.overrideStep,
          }),
        }
      } catch (error: unknown) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: unknown) {
      return status.NOT_FOUND
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
  }
}
