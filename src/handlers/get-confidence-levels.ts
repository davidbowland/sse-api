import { confidenceLevels } from '../assets/confidence-levels'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { log, redactEvent } from '../utils/logging'
import status from '../utils/status'

export const getConfidenceLevelsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...redactEvent(event), confidenceLevels })
  return { ...status.OK, body: JSON.stringify({ confidenceLevels }) }
}
