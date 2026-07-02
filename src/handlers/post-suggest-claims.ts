import { getCaptchaScore, recaptchaMinScore } from '../services/recaptcha'
import { getCachedOrGenerateClaims } from '../services/suggest-claims'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractRecaptchaToken, extractSuggestClaimsRequestFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postSuggestClaimsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const recaptchaToken = extractRecaptchaToken(event)
    const suggestClaimsRequest = extractSuggestClaimsRequestFromEvent(event)
    try {
      const score = await getCaptchaScore(recaptchaToken)
      log('reCAPTCHA result', { score })
      if (score < recaptchaMinScore) {
        return status.FORBIDDEN
      }

      const claims = await getCachedOrGenerateClaims(suggestClaimsRequest.language)
      log('Returning claims', { claims })
      return { ...status.OK, body: JSON.stringify({ claims }) }
    } catch (error: unknown) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
  }
}
