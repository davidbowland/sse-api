import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { getSessionById, setSessionById } from '../services/dynamodb'
import { log, logError } from '../utils/logging'
import { extractSessionFromEvent } from '../utils/events'
import { getNextId } from '../utils/id-generator'
import status from '../utils/status'

export const postSessionHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const session = extractSessionFromEvent(event)
    try {
      const sessionId = await getNextId(getSessionById)
      await setSessionById(sessionId, session)

      return { ...status.CREATED, body: JSON.stringify({ sessionId }) }
    } catch (error: any) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
