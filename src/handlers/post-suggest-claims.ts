import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { invokeModel, parseJson } from '../services/bedrock'
import { log, logError } from '../utils/logging'
import { getClaimSources } from '../services/claim-sources'
import { getPromptById } from '../services/dynamodb'
import status from '../utils/status'
import { suggestClaimsPromptId } from '../config'

const PROMPT_OUTPUT_FORMAT = '{"suggestions": [string]}'

export const postSuggestClaimsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const claimSources = await getClaimSources()
    const prompt = await getPromptById(suggestClaimsPromptId)
    const response = await parseJson(invokeModel(prompt, claimSources.join('\n')), PROMPT_OUTPUT_FORMAT)
    if (response === undefined) {
      return status.INTERNAL_SERVER_ERROR
    }
    log('Generated claims', { claimSources, suggestions: response.suggestions })

    return { ...status.OK, body: JSON.stringify({ claims: response.suggestions }) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
