import { confidenceChangedStep } from '../assets/conversation-steps'
import { getSessionById, setSessionById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Session } from '../types'
import { extractConfidenceChangeRequest } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postChangeConfidenceHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string
  try {
    const session = await getSessionById(sessionId)
    try {
      const confidenceLevels = session.context.possibleConfidenceLevels.map((level) => level.value)
      const { confidence } = extractConfidenceChangeRequest(event, confidenceLevels)
      try {
        const updatedSession: Session = {
          ...session,
          context: {
            ...session.context,
            confidence,
          },
          dividers: { ...session.dividers, [session.history.length]: { label: confidenceChangedStep.label } },
          newConversation: true,
          overrideStep: confidenceChangedStep,
          storedMessage: session.storedMessage ? session.storedMessage : session.history[session.history.length - 1],
        }
        await setSessionById(sessionId, updatedSession)

        return {
          ...status.OK,
          body: JSON.stringify({
            confidence,
            dividers: updatedSession.dividers,
            newConversation: true,
            overrideStep: updatedSession.overrideStep,
          }),
        }
      } catch (error: any) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: any) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
    }
  } catch (error: any) {
    return status.NOT_FOUND
  }
}
