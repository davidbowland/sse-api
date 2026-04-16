import { invokeModelSuggestClaims } from '../__mocks__'
import eventJson from '@events/post-suggest-claims.json'
import { postSuggestClaimsHandler } from '@handlers/post-suggest-claims'
import * as suggestClaimsService from '@services/suggest-claims'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/suggest-claims')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-suggest-claims', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(suggestClaimsService).getCachedOrGenerateClaims.mockResolvedValue(invokeModelSuggestClaims)
    jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockReturnValue({ language: 'en-US' })
  })

  describe('postSuggestClaimsHandler', () => {
    it('returns claims', async () => {
      const result: any = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body)).toEqual({ claims: invokeModelSuggestClaims })
    })

    it('calls getCachedOrGenerateClaims with the correct language', async () => {
      await postSuggestClaimsHandler(event)

      expect(suggestClaimsService.getCachedOrGenerateClaims).toHaveBeenCalledWith('en-US')
    })

    it('returns BAD_REQUEST when extractSuggestClaimsRequestFromEvent throws', async () => {
      jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    it('returns INTERNAL_SERVER_ERROR when getCachedOrGenerateClaims rejects', async () => {
      jest.mocked(suggestClaimsService).getCachedOrGenerateClaims.mockRejectedValueOnce(new Error('Rejected'))
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })
  })
})
