import AJV from 'ajv/dist/jtd'

import { confidenceLevels, confidenceLevelsOrdered } from '../assets/confidence-levels'
import { conversationSteps } from '../assets/conversation-steps'
import { sessionExpireHours } from '../config'
import {
  APIGatewayProxyEventV2,
  Claim,
  ConfidenceChangeRequest,
  LLMRequest,
  Session,
  SuggestClaimsRequest,
  TranscribeStreamingRequest,
} from '../types'

const ajv = new AJV({ allErrors: true })

const getTimeInSeconds = () => Math.floor(Date.now() / 1000)

const trim = (str: string) => str.replace(/^\s+|\r|\n|\s+$/g, '')

// Claims

interface ClaimBody {
  claim: string
  language?: string
}

const formatClaim = (body: ClaimBody): Claim => {
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
  } else if (trim(body.claim).length === 0) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/claim',
          keyword: 'value',
          message: 'Claim must be non-empty text',
          schemaPath: '/properties/claim/value',
        },
      ]),
    )
  }
  return { claim: trim(body.claim), language: body.language ?? 'en-US' }
}

export const extractClaimFromEvent = (event: APIGatewayProxyEventV2): Claim =>
  formatClaim(parseEventBody(event) as ClaimBody)

// Change confidence

export interface ConfidenceChangeRequestBody {
  confidence: string
}

const formatConfidenceChangeRequest = (
  body: ConfidenceChangeRequestBody,
  confidenceLevels: string[],
): ConfidenceChangeRequest => {
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
): ConfidenceChangeRequest =>
  formatConfidenceChangeRequest(parseEventBody(event) as ConfidenceChangeRequestBody, confidenceLevels)

// LLM request

interface LLMRequestBody {
  content: string
}

const formatLlmRequest = (body: LLMRequestBody): LLMRequest => {
  const jsonTypeDefinition = {
    properties: {
      content: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  } else if (trim(body.content).length === 0) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/content',
          keyword: 'value',
          message: 'Content must be non-empty text',
          schemaPath: '/properties/content/value',
        },
      ]),
    )
  }
  return {
    message: { content: trim(body.content), role: 'user' },
  }
}

export const extractLlmRequestFromEvent = (event: APIGatewayProxyEventV2): LLMRequest =>
  formatLlmRequest(parseEventBody(event) as LLMRequestBody)

// Sessions

interface SessionBody {
  claim: string
  confidence: string
  expiration?: number
  language?: string
}

const formatSession = (body: SessionBody): Session => {
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
  } else if (trim(body.claim).length === 0) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/claim',
          keyword: 'value',
          message: 'Claim must be non-empty text',
          schemaPath: '/properties/claim/value',
        },
      ]),
    )
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
      claim: trim(body.claim),
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
    incorrect_guesses: 0,
    newConversation: true,
    originalConfidence: body.confidence,
    question: 0,
  }
}

export const extractSessionFromEvent = (event: APIGatewayProxyEventV2): Session =>
  formatSession(parseEventBody(event) as SessionBody)

// Suggest claims request

interface SuggestClaimsRequestBody {
  language?: string
}

const formatSuggestClaimsRequest = (body: SuggestClaimsRequestBody): SuggestClaimsRequest => {
  const jsonTypeDefinition = {
    optionalProperties: {
      language: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  } else if (body.language && trim(body.language).length === 0) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/language',
          keyword: 'value',
          message: 'Language must be non-empty text when present',
          schemaPath: '/properties/language/value',
        },
      ]),
    )
  }
  return { language: body.language ?? 'en-US' }
}

export const extractSuggestClaimsRequestFromEvent = (event: APIGatewayProxyEventV2): SuggestClaimsRequest =>
  formatSuggestClaimsRequest(parseEventBody(event) as SuggestClaimsRequestBody)

// Transcribe streaming request

interface TranscribeStreamingRequestBody {
  languageCode: string
  sampleRate: number
  mediaFormat: 'pcm' | 'ogg-opus' | 'flac'
}

const SUPPORTED_LANGUAGES = ['en-US', 'en-GB', 'es-US', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT', 'ja-JP', 'ko-KR', 'zh-CN']
const SUPPORTED_SAMPLE_RATES = [8000, 16000, 22050, 44100, 48000]
const SUPPORTED_MEDIA_FORMATS = ['pcm', 'ogg-opus', 'flac']

const formatTranscribeStreamingRequest = (body: TranscribeStreamingRequestBody): TranscribeStreamingRequest => {
  const jsonTypeDefinition = {
    properties: {
      languageCode: { type: 'string' },
      mediaFormat: { enum: SUPPORTED_MEDIA_FORMATS },
      sampleRate: { type: 'float64' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }

  const languageCode = trim(body.languageCode)

  if (!SUPPORTED_LANGUAGES.includes(languageCode)) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/languageCode',
          keyword: 'enum',
          message: `Unsupported language code: ${languageCode}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
          schemaPath: '/properties/languageCode/enum',
        },
      ]),
    )
  }

  const sampleRate = body.sampleRate
  if (!SUPPORTED_SAMPLE_RATES.includes(sampleRate)) {
    throw new Error(
      JSON.stringify([
        {
          instancePath: '/sampleRate',
          keyword: 'enum',
          message: `Unsupported sample rate: ${sampleRate}. Supported: ${SUPPORTED_SAMPLE_RATES.join(', ')}`,
          schemaPath: '/properties/sampleRate/enum',
        },
      ]),
    )
  }

  return {
    languageCode,
    mediaFormat: body.mediaFormat,
    sampleRate,
  }
}

export const extractTranscribeStreamingRequestFromEvent = (event: APIGatewayProxyEventV2): TranscribeStreamingRequest =>
  formatTranscribeStreamingRequest(parseEventBody(event) as TranscribeStreamingRequestBody)

// Events

const parseEventBody = (event: APIGatewayProxyEventV2): unknown =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string),
  )
