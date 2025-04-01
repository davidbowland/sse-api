import { APIGatewayProxyEventV2 } from '@types'
import { extractClaimFromEvent } from '@utils/events'
import validateEventJson from '@events/post-validate-claim.json'

describe('events', () => {
  describe('extractClaimFromEvent', () => {
    const event = validateEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the claim from the event', () => {
      const result = extractClaimFromEvent(event)
      expect(result).toEqual({
        claim: 'Chickpeas are neither chicks nor peas.',
      })
    })

    it('should extract the claim from the event when it is Base64', () => {
      const eventWithBase64Claim = {
        ...event,
        body: Buffer.from(event.body).toString('base64'),
        isBase64Encoded: true,
      }
      const result = extractClaimFromEvent(eventWithBase64Claim)
      expect(result).toEqual({
        claim: 'Chickpeas are neither chicks nor peas.',
      })
    })

    it('should error when the claim is malformed', () => {
      const eventWithMalformedClaim = {
        ...event,
        body: JSON.stringify({}),
      }
      expect(() => extractClaimFromEvent(eventWithMalformedClaim)).toThrow()
    })
  })
})
