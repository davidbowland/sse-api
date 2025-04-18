import {
  APIGatewayProxyEventV2,
  Claim,
  ConfidenceChangeRequest,
  LLMRequest,
  Session,
  SuggestClaimsRequest,
} from '../types'
import { confidenceLevels, confidenceLevelsOrdered } from '../assets/confidence-levels'
import AJV from 'ajv/dist/jtd'
import { conversationSteps } from '../assets/conversation-steps'
import { sessionExpireHours } from '../config'

const ajv = new AJV({ allErrors: true })

const getTimeInSeconds = () => Math.floor(Date.now() / 1000)

// Claims

const formatClaim = (body: any): Claim => {
  const jsonTypeDefinition = {
    optionalProperties: {
      language: { type: 'string' },
    },
    properties: {
      claim: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return { claim: body.claim, language: body.language ?? 'en-US' }
}

export const extractClaimFromEvent = (event: APIGatewayProxyEventV2): Claim => formatClaim(parseEventBody(event))

// Change confidence

const formatConfidenceChangeRequest = (body: any, confidenceLevels: string[]): ConfidenceChangeRequest => {
  const jsonTypeDefinition = {
    properties: {
      confidence: {
        enum: confidenceLevels,
      },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return { confidence: body.confidence }
}

export const extractConfidenceChangeRequest = (
  event: APIGatewayProxyEventV2,
  confidenceLevels: string[],
): ConfidenceChangeRequest => formatConfidenceChangeRequest(parseEventBody(event), confidenceLevels)

// LLM request

const formatLlmRequest = (body: any): LLMRequest => {
  const jsonTypeDefinition = {
    properties: {
      content: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return {
    message: { content: body.content.trim().replace(/\r|\n/g, ''), role: 'user' },
  }
}

export const extractLlmRequestFromEvent = (event: APIGatewayProxyEventV2): LLMRequest =>
  formatLlmRequest(parseEventBody(event))

// Sessions

const formatSession = (body: any): Session => {
  const jsonTypeDefinition = {
    optionalProperties: {
      expiration: { type: 'float64' },
      language: { type: 'string' },
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
      language: body.language ?? 'en-US',
      possibleConfidenceLevels: confidenceLevels,
    },
    conversationSteps,
    currentStep: conversationSteps[0].value,
    dividers: { 0: { label: conversationSteps[0].label } },
    expiration: body.expiration ?? lastExpiration,
    history: [],
    newConversation: true,
    originalConfidence: body.confidence,
  }
}

export const extractSessionFromEvent = (event: APIGatewayProxyEventV2): Session => formatSession(parseEventBody(event))

// Suggest claims request

const formatSuggestClaimsRequest = (body: any): SuggestClaimsRequest => {
  const jsonTypeDefinition = {
    optionalProperties: {
      language: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return { language: body.language ?? 'en-US' }
}

export const extractSuggestClaimsRequestFromEvent = (event: APIGatewayProxyEventV2): SuggestClaimsRequest =>
  formatSuggestClaimsRequest(parseEventBody(event))

// Events

const parseEventBody = (event: APIGatewayProxyEventV2): any =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string),
  )
