import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { log, logError } from '../utils/logging'
import { getClaimSources } from '../services/claim-sources'
import { getPromptById } from '../services/dynamodb'
import { invokeModel } from '../services/bedrock'
import status from '../utils/status'
import { suggestClaimsPromptId } from '../config'

export const postSuggestClaimsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  try {
    const claimSources = await getClaimSources()
    const prompt = await getPromptById(suggestClaimsPromptId)
    const claims = await invokeModel(prompt, claimSources.join('\n'))
    log('Generated claims', { claims, claimSources })

    return { ...status.OK, body: JSON.stringify({ claims }) }
  } catch (error) {
    logError(error)
    return status.INTERNAL_SERVER_ERROR
  }
}
