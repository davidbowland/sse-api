import { validateClaimPromptId } from '../config'
import { invokeModel, singleTurn } from '../services/bedrock'
import { getPromptById } from '../services/dynamodb'
import { getCaptchaScore, recaptchaMinScore } from '../services/recaptcha'
import { validationResponseSchema } from '../services/response-schemas'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractClaimFromEvent, extractRecaptchaToken } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postValidateClaimHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const recaptchaToken = extractRecaptchaToken(event)
    const { claim, language } = extractClaimFromEvent(event)
    try {
      const score = await getCaptchaScore(recaptchaToken)
      log('reCAPTCHA result', { score })
      if (score < recaptchaMinScore) {
        return status.FORBIDDEN
      }

      const prompt = await getPromptById(validateClaimPromptId)
      const validation = await invokeModel(prompt, validationResponseSchema, {
        history: singleTurn(claim),
        templateVars: { language },
      })
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
