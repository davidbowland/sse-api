import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import * as events from '@utils/events'
import { prompt, validationResult } from '../__mocks__'
import { APIGatewayProxyEventV2 } from '@types'
import eventJson from '@events/post-validate-claim.json'
import { postValidateClaimHandler } from '@handlers/post-validate-claim'
import status from '@utils/status'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-suggest-claims', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  const claim = 'Brisket is the best meat'

  beforeAll(() => {
    jest.mocked(bedrock).invokeModel.mockResolvedValue(validationResult)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(events).extractClaimFromEvent.mockReturnValue({ claim })
  })

  describe('postValidateClaimHandler', () => {
    it('returns claims validation information', async () => {
      const result = await postValidateClaimHandler(event)
      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body)).toEqual(validationResult)
    })

    it('returns BAD_REQUEST when extractClaimFromEvent throws an error', async () => {
      jest.mocked(events).extractClaimFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })

      const result = await postValidateClaimHandler(event)
      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    it('returns INTERNAL_SERVER_ERROR when getPromptById rejects', async () => {
      jest.mocked(dynamodb).getPromptById.mockRejectedValueOnce(new Error('Rejected'))

      const result = await postValidateClaimHandler(event)
      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })

    it('returns INTERNAL_SERVER_ERROR when invokeModel rejects', async () => {
      jest.mocked(bedrock).invokeModel.mockRejectedValueOnce(new Error('Rejected'))

      const result = await postValidateClaimHandler(event)
      expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
    })
  })
})
