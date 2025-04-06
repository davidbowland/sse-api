import { APIGatewayProxyEventV2, Claim, LLMRequest, Session } from '../types'
import { confidenceLevels, confidenceLevelsOrdered } from '../assets/confidence-levels'
import AJV from 'ajv/dist/jtd'
import { sessionExpireHours } from '../config'

const ajv = new AJV({ allErrors: true })

const getTimeInSeconds = () => Math.floor(Date.now() / 1000)

// Claims

const formatClaim = (body: any): Claim => {
  const jsonTypeDefinition = {
    properties: {
      claim: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return { claim: body.claim }
}

export const extractClaimFromEvent = (event: APIGatewayProxyEventV2): Claim => formatClaim(parseEventBody(event))

// LLM request

const formatLlmRequest = (body: any): LLMRequest => {
  const jsonTypeDefinition = {
    optionalProperties: {
      newConversation: { type: 'boolean' },
    },
    properties: {
      content: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return {
    message: { content: body.content, role: 'user' },
    newConversation: body.newConversation ?? false,
  }
}

export const extractLlmRequestFromEvent = (event: APIGatewayProxyEventV2): LLMRequest =>
  formatLlmRequest(parseEventBody(event))

// Sessions

const formatSession = (body: any): Session => {
  const jsonTypeDefinition = {
    optionalProperties: {
      expiration: { type: 'float64' },
    },
    properties: {
      claim: { type: 'string' },
      confidence: {
        enum: confidenceLevelsOrdered,
      },
    },
  }
  // 1 hr * 60 minutes / hr * 60 seconds / min = 3_600
  const lastExpiration = getTimeInSeconds() + sessionExpireHours * 3_600

  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  } else if ((body.expiration ?? 0) > lastExpiration) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/expiration',
          keyword: 'value',
          message: 'must be less than the maximum allowed value',
          params: { maximum: [lastExpiration] },
          schemaPath: '/properties/expiration/value',
        },
      ]),
    )
  }
  return {
    context: {
      claim: body.claim,
      confidence: body.confidence,
      generatedReasons: [],
      possibleConfidenceLevels: confidenceLevels,
    },
    expiration: body.expiration ?? lastExpiration,
    history: [],
  }
}

export const extractSessionFromEvent = (event: APIGatewayProxyEventV2): Session => formatSession(parseEventBody(event))

// Events

const parseEventBody = (event: APIGatewayProxyEventV2): any =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string),
  )
