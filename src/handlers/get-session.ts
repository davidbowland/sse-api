import { getSessionById } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { log } from '../utils/logging'
import status from '../utils/status'

export const getSessionHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2<any>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string

  try {
    const result = await getSessionById(sessionId)
    return { ...status.OK, body: JSON.stringify(result) }
  } catch (error: any) {
    return status.NOT_FOUND
  }
}
