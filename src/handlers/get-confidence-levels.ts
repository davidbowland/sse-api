import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { confidenceLevels } from '../assets/confidence-levels'
import { log } from '../utils/logging'
import status from '../utils/status'

export const getConfidenceLevelsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined, confidenceLevels })
  return { ...status.OK, body: JSON.stringify({ confidenceLevels }) }
}
