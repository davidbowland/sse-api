import Ajv from 'ajv'

import { llmResponseSchema, suggestClaimsResponseSchema, validationResponseSchema } from '@services/response-schemas'

const ajv = new Ajv()

describe('response-schemas', () => {
  describe('validationResponseSchema', () => {
    const validate = ajv.compile(validationResponseSchema.jsonSchema)

    it('accepts a valid response', () => {
      expect(validate({ inappropriate: false, suggestions: ['a', 'b'] })).toBe(true)
    })

    it('rejects a response missing required fields', () => {
      expect(validate({ suggestions: ['a'] })).toBe(false)
    })

    it('rejects a response with the wrong field type', () => {
      expect(validate({ inappropriate: 'no', suggestions: ['a'] })).toBe(false)
    })
  })

  describe('suggestClaimsResponseSchema', () => {
    const validate = ajv.compile(suggestClaimsResponseSchema.jsonSchema)

    it('accepts a valid response', () => {
      expect(validate({ suggestions: ['a', 'b'] })).toBe(true)
    })

    it('rejects a response missing required fields', () => {
      expect(validate({})).toBe(false)
    })

    it('rejects a response with the wrong field type', () => {
      expect(validate({ suggestions: 'not-an-array' })).toBe(false)
    })
  })

  describe('llmResponseSchema', () => {
    const validate = ajv.compile(llmResponseSchema.jsonSchema)

    it('accepts a valid minimal response', () => {
      expect(validate({ finished: true, message: 'hello' })).toBe(true)
    })

    it('accepts a valid response with optional fields', () => {
      expect(validate({ correct: true, finished: false, message: 'hello', reasons: ['a'] })).toBe(true)
    })

    it('accepts a response with a question field, since probe-confidence/probe-reasons prompts emit one', () => {
      expect(validate({ finished: false, message: 'hello', question: 2 })).toBe(true)
    })

    it('rejects a response missing required fields', () => {
      expect(validate({ finished: true })).toBe(false)
    })

    it('rejects a response with the wrong field type', () => {
      expect(validate({ finished: 'yes', message: 'hello' })).toBe(false)
    })
  })
})
