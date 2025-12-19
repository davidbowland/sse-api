import { getSessionById } from '../services/dynamodb'
import { createStreamingSession } from '../services/transcribe'
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
import { extractTranscribeStreamingRequestFromEvent } from '../utils/events'
import { log, logError } from '../utils/logging'
import status from '../utils/status'

export const postTranscribeStreamsHandler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2<unknown>> => {
  log('Received event', { ...event, body: undefined })
  const sessionId = event.pathParameters?.sessionId as string

  try {
    await getSessionById(sessionId)
  } catch (error: unknown) {
    return status.NOT_FOUND
  }

  try {
    const request = extractTranscribeStreamingRequestFromEvent(event)

    try {
      const result = await createStreamingSession(request.languageCode, request.sampleRate, request.mediaFormat)

      return { ...status.OK, body: JSON.stringify(result) }
    } catch (error: unknown) {
      logError('Failed to create streaming session', { error, sessionId })
      return status.INTERNAL_SERVER_ERROR
    }
  } catch (error: unknown) {
    return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
  }
}
