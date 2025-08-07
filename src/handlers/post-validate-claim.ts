import { validateClaimPromptId } from '../config'
import { invokeModel } from '../services/bedrock'
import { getPromptById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ValidationResponse } from '../types'
import { extractClaimFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postValidateClaimHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const { claim, language } = extractClaimFromEvent(event)
    try {
      const prompt = await getPromptById(validateClaimPromptId)
      const validation = await invokeModel<ValidationResponse>(prompt, claim, { language })
      log('Claim validation complete', { claim, validation })

      return { ...status.OK, body: JSON.stringify(validation) }
    } catch (error: unknown) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
  }
}
