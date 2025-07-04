import { llmRequest, newSession } from '../__mocks__'
import { confidenceLevelsOrdered } from '@assets/confidence-levels'
import changeConfidenceJson from '@events/post-change-confidence.json'
import llmResponseEventJson from '@events/post-llm-response.json'
import createEventJson from '@events/post-session.json'
import suggestClaimsEventJson from '@events/post-suggest-claims.json'
import validateEventJson from '@events/post-validate-claim.json'
import { APIGatewayProxyEventV2 } from '@types'
import {
  extractClaimFromEvent,
  extractConfidenceChangeRequest,
  extractLlmRequestFromEvent,
  extractSessionFromEvent,
  extractSuggestClaimsRequestFromEvent,
} from '@utils/events'

describe('events', () => {
  const epochTime = 1742760571384

  beforeAll(() => {
    Date.now = () => epochTime
  })

  describe('extractClaimFromEvent', () => {
    const event = validateEventJson as unknown as APIGatewayProxyEventV2
    const newClaim = {
      claim: 'Chickpeas are neither chicks nor peas.',
      language: 'en-US',
    }

    it('should extract the claim from the event', () => {
      const result = extractClaimFromEvent(event)

      expect(result).toEqual(newClaim)
    })

    it('should extract the claim from the event when it is Base64 encoded', () => {
      const eventWithBase64Claim = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      }
      const result = extractClaimFromEvent(eventWithBase64Claim)

      expect(result).toEqual(newClaim)
    })

    it('should error when the claim is malformed', () => {
      const eventWithMalformedClaim = {
        ...event,
        body: JSON.stringify({}),
      }

      expect(() => extractClaimFromEvent(eventWithMalformedClaim)).toThrow()
    })

    it('should error when claim content is empty', () => {
      const eventWithEmptyClaim = {
        ...event,
        body: JSON.stringify({ claim: '' }),
      }

      expect(() => extractClaimFromEvent(eventWithEmptyClaim)).toThrow()
    })
  })

  describe('extractConfidenceChangeRequest', () => {
    const event = changeConfidenceJson as unknown as APIGatewayProxyEventV2

    it('should extract the confidence change request from the event', () => {
      const result = extractConfidenceChangeRequest(event, confidenceLevelsOrdered)

      expect(result).toEqual({
        confidence: 'disagree',
      })
    })

    it('should reject invalid confidence levels', () => {
      const eventWithInvalidConfidence = {
        ...event,
        body: JSON.stringify({
          confidence: 'invalid',
        }),
      }

      expect(() => extractConfidenceChangeRequest(eventWithInvalidConfidence, confidenceLevelsOrdered)).toThrow()
    })
  })

  describe('extractLlmRequestFromEvent', () => {
    const event = llmResponseEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the LLMRequest from the event', () => {
      const result = extractLlmRequestFromEvent(event)

      expect(result).toEqual(llmRequest)
    })

    it('should extract the LLMRequest from the event when it is Base64 encoded', () => {
      const eventWithBase64Request = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      }
      const result = extractLlmRequestFromEvent(eventWithBase64Request)

      expect(result).toEqual(llmRequest)
    })

    it('should trim leading spaces, trailing spaces, and newlines', () => {
      const eventWithWhitespace = {
        ...event,
        body: '{"content":"   A big,\\n fat, fuzzy\\r\\n testing!!\\n  \\t"}',
      }
      const result = extractLlmRequestFromEvent(eventWithWhitespace)

      expect(result.message.content).toEqual('A big, fat, fuzzy testing!!')
    })

    it('should error when the chat message is malformed', () => {
      const eventWithMalformedMessage = {
        ...event,
        body: JSON.stringify({}),
      }

      expect(() => extractLlmRequestFromEvent(eventWithMalformedMessage)).toThrow()
    })

    it('should error when the chat contents is empty', () => {
      const eventWithEmptyContents = {
        ...event,
        body: JSON.stringify({ content: '' }),
      }

      expect(() => extractLlmRequestFromEvent(eventWithEmptyContents)).toThrow()
    })
  })

  describe('extractSessionFromEvent', () => {
    const event = createEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the session from the event', () => {
      const result = extractSessionFromEvent(event)

      expect(result).toEqual(newSession)
    })

    it('should extract the session from the event when it is Base64 encoded', () => {
      const eventWithBase64Session = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      }
      const result = extractSessionFromEvent(eventWithBase64Session)

      expect(result).toEqual(newSession)
    })

    it('should error when the session is malformed', () => {
      const eventWithMalformedSession = {
        ...event,
        body: JSON.stringify({}),
      }

      expect(() => extractSessionFromEvent(eventWithMalformedSession)).toThrow()
    })

    it('should error when the session claim is empty', () => {
      const eventWithEmptyClaim = {
        ...event,
        body: JSON.stringify({
          claim: '',
          confidence: 'slightly agree',
        }),
      }

      expect(() => extractSessionFromEvent(eventWithEmptyClaim)).toThrow()
    })

    it("doesn't allow late expiration", () => {
      const eventWithMalformedSession = {
        ...event,
        body: JSON.stringify({
          claim: 'Rhode Island is neither a road nor an island.',
          confidence: 'slightly agree',
          expiration: epochTime + 1_000_000_000,
        }),
      }

      expect(() => extractSessionFromEvent(eventWithMalformedSession)).toThrow()
    })
  })

  describe('extractSuggestClaimsRequestFromEvent', () => {
    const event = suggestClaimsEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the SuggestClaimsRequest from the event', () => {
      const result = extractSuggestClaimsRequestFromEvent(event)

      expect(result).toEqual({
        language: 'en-GB',
      })
    })

    it('should extract the SuggestRequest from the event when it is Base64', () => {
      const eventWithBase64Request = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      }
      const result = extractSuggestClaimsRequestFromEvent(eventWithBase64Request)

      expect(result).toEqual({
        language: 'en-GB',
      })
    })

    it('should default to en-US when language is not provided', () => {
      const eventNoLanguageRequest = {
        ...event,
        body: JSON.stringify({}),
      }
      const result = extractSuggestClaimsRequestFromEvent(eventNoLanguageRequest)

      expect(result).toEqual({
        language: 'en-US',
      })
    })

    it('should error when the SuggestRequest is malformed', () => {
      const eventWithMalformedRequest = {
        ...event,
        body: JSON.stringify({ foo: 'bar' }),
      }
      expect(() => extractSuggestClaimsRequestFromEvent(eventWithMalformedRequest)).toThrow()
    })

    it('should error when the SuggestRequest is empty', () => {
      const eventWithMalformedRequest = {
        ...event,
        body: JSON.stringify({ language: '  ' }),
      }
      expect(() => extractSuggestClaimsRequestFromEvent(eventWithMalformedRequest)).toThrow()
    })
  })
})
