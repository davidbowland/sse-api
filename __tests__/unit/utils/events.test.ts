import { extractClaimFromEvent, extractSessionFromEvent } from '@utils/events'
import { APIGatewayProxyEventV2 } from '@types'
import createEventJson from '@events/post-session.json'
import { newSession } from '../__mocks__'
import validateEventJson from '@events/post-validate-claim.json'

describe('events', () => {
  const epochTime = 1742760571384

  beforeAll(() => {
    Date.now = () => epochTime
  })

  describe('extractClaimFromEvent', () => {
    const event = validateEventJson as unknown as APIGatewayProxyEventV2
    const newClaim = {
      claim: 'Chickpeas are neither chicks nor peas.',
    }

    it('should extract the claim from the event', () => {
      const result = extractClaimFromEvent(event)
      expect(result).toEqual(newClaim)
    })

    it('should extract the claim from the event when it is Base64', () => {
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
  })

  describe('extractSessionFromEvent', () => {
    const event = createEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the session from the event', () => {
      const result = extractSessionFromEvent(event)
      expect(result).toEqual(newSession)
    })

    it('should extract the session from the event when it is Base64', () => {
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
})
