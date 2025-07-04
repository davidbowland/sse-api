import { suggestClaimsPromptId } from '../config'
import { invokeModel, parseJson } from '../services/bedrock'
import { getClaimSources } from '../services/claim-sources'
import { getPromptById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ValidationResponse } from '../types'
import { extractSuggestClaimsRequestFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

const PROMPT_OUTPUT_FORMAT = '{"suggestions": [string]}'

export const postSuggestClaimsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const suggestClaimsRequest = extractSuggestClaimsRequestFromEvent(event)
    try {
      const claimSources = await getClaimSources()
      const prompt = await getPromptById(suggestClaimsPromptId)
      const response = await parseJson<ValidationResponse>(
        invokeModel(prompt, claimSources.join('\n'), suggestClaimsRequest),
        PROMPT_OUTPUT_FORMAT,
      )
      if (response === undefined) {
        return status.INTERNAL_SERVER_ERROR
      }
      log('Generated claims', { claimSources, suggestions: response.suggestions })

      return { ...status.OK, body: JSON.stringify({ claims: response.suggestions }) }
    } catch (error: any) {
      logError(error)
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: any) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: error.message }) }
  }
}
