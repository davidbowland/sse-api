import { LLMResponse, ResponseSchema, SuggestClaimsResponse, ValidationResponse } from '../types'

export const validationResponseSchema: ResponseSchema<ValidationResponse> = {
  toolDescription: 'Submit whether the claim is inappropriate and a list of suggested truth claims.',
  toolName: 'submit_claim_validation',
  jsonSchema: {
    type: 'object',
    properties: {
      inappropriate: { type: 'boolean' },
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['inappropriate', 'suggestions'],
    additionalProperties: false,
  },
}

export const suggestClaimsResponseSchema: ResponseSchema<SuggestClaimsResponse> = {
  toolDescription: 'Submit the list of generated truth claim suggestions.',
  toolName: 'submit_claim_suggestions',
  jsonSchema: {
    type: 'object',
    properties: {
      suggestions: { type: 'array', items: { type: 'string' } },
    },
    required: ['suggestions'],
    additionalProperties: false,
  },
}

export const llmResponseSchema: ResponseSchema<LLMResponse> = {
  toolDescription: 'Submit the assistant response for this step of the conversation.',
  toolName: 'submit_conversation_response',
  jsonSchema: {
    type: 'object',
    properties: {
      correct: { type: 'boolean' },
      finished: { type: 'boolean' },
      message: { type: 'string' },
      question: { type: 'integer' },
      reasons: { type: 'array', items: { type: 'string' } },
    },
    required: ['finished', 'message'],
    additionalProperties: false,
  },
}
