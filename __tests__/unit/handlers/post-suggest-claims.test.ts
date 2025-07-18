import { claimSources, invokeModelSuggestedClaims, prompt } from '../__mocks__'
import eventJson from '@events/post-suggest-claims.json'
import { postSuggestClaimsHandler } from '@handlers/post-suggest-claims'
import * as bedrock from '@services/bedrock'
import * as claimSourcesService from '@services/claim-sources'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@services/claim-sources')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-suggest-claims', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(bedrock).invokeModel.mockResolvedValue({ suggestions: invokeModelSuggestedClaims })
    jest.mocked(bedrock).parseJson.mockImplementation((json) => json)
    jest.mocked(claimSourcesService).getClaimSources.mockResolvedValue(claimSources)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockReturnValue({ language: 'en-US' })
  })

  describe('postSuggestClaimsHandler', () => {
    it('returns claims', async () => {
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body)).toEqual({ claims: invokeModelSuggestedClaims })
    })

    it('returns BAD_REQEUST when extractSuggestClaimsRequestFromEvent throws', async () => {
      jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    it('returns INTERNAL_SERVER_ERROR when getClaimSources rejects', async () => {
      jest.mocked(claimSourcesService).getClaimSources.mockRejectedValueOnce(new Error('Rejected'))
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('returns INTERNAL_SERVER_ERROR when getPromptById rejects', async () => {
      jest.mocked(dynamodb).getPromptById.mockRejectedValueOnce(new Error('Rejected'))
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('returns INTERNAL_SERVER_ERROR when invokeModel rejects', async () => {
      jest.mocked(bedrock).invokeModel.mockRejectedValueOnce(new Error('Rejected'))
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('returns INTERNAL_SERVER_ERROR when invokeModel returns undefined', async () => {
      jest.mocked(bedrock).invokeModel.mockResolvedValueOnce(undefined)
      const result = await postSuggestClaimsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })
  })
})
