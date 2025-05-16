import { validateClaimPromptId } from '../config'
import { invokeModel, parseJson } from '../services/bedrock'
import { getPromptById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractClaimFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

const PROMPT_OUTPUT_FORMAT = '{"inappropriate":boolean,"suggestions": [string]}'

export const postValidateClaimHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const { claim, language } = extractClaimFromEvent(event)
    try {
      const prompt = await getPromptById(validateClaimPromptId)
      const validation = await parseJson(invokeModel(prompt, claim, { language }), PROMPT_OUTPUT_FORMAT)
      if (validation === undefined) {
        return status.INTERNAL_SERVER_ERROR
      }
      log('Claim validation complete', { claim, validation })

      return { ...status.OK, body: JSON.stringify(validation) }
    } catch (error: any) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
