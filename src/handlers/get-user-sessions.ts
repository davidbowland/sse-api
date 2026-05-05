import { getSessionsByUserId } from '../services/dynamodb'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractAuthContext } from '../utils/auth'
import { log } from '../utils/logging'
import status from '../utils/status'

export const getUserSessionsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })

  // API Gateway JWT Authorizer guarantees a valid token before this runs.
  // This is a defensive check for misconfiguration or local testing.
  const auth = extractAuthContext(event)
  if (!auth.isAuthenticated || !auth.googleSub) {
    return { ...status.UNAUTHORIZED, body: JSON.stringify({ message: 'Valid authentication required' }) }
  }

  try {
    const sessions = await getSessionsByUserId(auth.googleSub)
    return { ...status.OK, body: JSON.stringify(sessions) }
  } catch (error: unknown) {
    return status.INTERNAL_SERVER_ERROR
  }
}
