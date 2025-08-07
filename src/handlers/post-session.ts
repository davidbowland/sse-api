import { validateClaimPromptId } from '../config'
import { invokeModel } from '../services/bedrock'
import { getPromptById, getSessionById, setSessionById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ValidationResponse } from '../types'
import { extractSessionFromEvent } from '../utils/events'
import { getNextId } from '../utils/id-generator'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postSessionHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const session = extractSessionFromEvent(event)
    try {
      const prompt = await getPromptById(validateClaimPromptId)
      const validation = await invokeModel<ValidationResponse>(prompt, session.context.claim, {
        language: session.context.language,
      })

      if (validation.inappropriate) {
        log('Claim validation failed - inappropriate content', { claim: session.context.claim, validation })
        return { ...status.BAD_REQUEST, body: JSON.stringify({ message: 'Inappropriate claim content' }) }
      }

      const sessionId = await getNextId(getSessionById)
      await setSessionById(sessionId, session)

      return { ...status.CREATED, body: JSON.stringify({ sessionId }) }
    } catch (error: unknown) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
  }
}
