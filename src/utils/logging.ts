import AWSXRay from 'aws-xray-sdk-core'
import https from 'https'

import { debugLogging } from '../config'
import { APIGatewayProxyEventV2 } from '../types'

export const extractRequestError = (message: string): { errors?: unknown; message?: string } => {
  try {
    return { errors: JSON.parse(message) }
  } catch (e: unknown) {
    return { message }
  }
}

export const log = (...args: unknown[]): unknown => console.log(...args)

export const logDebug = (...args: unknown[]): unknown => (debugLogging ? console.log(...args) : undefined)

export const logError = (...args: unknown[]): unknown => console.error(...args)

export const logWarn = (...args: unknown[]): unknown => console.warn(...args)

export const xrayCapture = (x: any): any => (process.env.AWS_SAM_LOCAL === 'true' ? x : AWSXRay.captureAWSv3Client(x))

export const xrayCaptureHttps = (): void =>
  process.env.AWS_SAM_LOCAL === 'true' ? undefined : AWSXRay.captureHTTPsGlobal(https)

const REDACTED_HEADERS = new Set(['authorization'])

// Strip sensitive keys from a header map, case-insensitively.
const redactHeaders = (headers: Record<string, string | undefined> | undefined): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => !REDACTED_HEADERS.has(key.toLowerCase())))

// Only body/Authorization carry secrets or PII; everything else in the event (method, path,
// query params, request id, source IP) is safe and useful for debugging. This API has no
// JWT/Cognito authorizer (sessions are authenticated solely by CSPRNG session id), so there
// are no authorizer claims to redact here.
export const redactEvent = (event: APIGatewayProxyEventV2): Record<string, unknown> => ({
  ...event,
  body: undefined,
  headers: redactHeaders(event.headers),
})
