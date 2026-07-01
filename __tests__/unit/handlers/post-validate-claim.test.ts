import { prompt, validationResult } from '../__mocks__'
import eventJson from '@events/post-validate-claim.json'
import { postValidateClaimHandler } from '@handlers/post-validate-claim'
import * as bedrock from '@services/bedrock'
import * as dynamodb from '@services/dynamodb'
import * as recaptcha from '@services/recaptcha'
import { APIGatewayProxyEventV2 } from '@types'
import * as events from '@utils/events'
import status from '@utils/status'

jest.mock('@services/bedrock')
jest.mock('@services/dynamodb')
jest.mock('@services/recaptcha')
jest.mock('@utils/events')
jest.mock('@utils/logging')

describe('post-validate-claim', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  const claim = 'Brisket is the best meat'

  beforeAll(() => {
    jest.mocked(bedrock).invokeModel.mockResolvedValue(validationResult)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(events).extractClaimFromEvent.mockReturnValue({ claim, language: 'en-US' })
    jest.mocked(events).extractRecaptchaToken.mockReturnValue('ytrewsdfghjmnbgtyu')
    jest.mocked(recaptcha).getCaptchaScore.mockResolvedValue(0.9)
  })

  describe('postValidateClaimHandler', () => {
    it('returns claims validation information', async () => {
      const result = await postValidateClaimHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body)).toEqual(validationResult)
    })

    it('calls getCaptchaScore with the extracted token', async () => {
      await postValidateClaimHandler(event)

      expect(recaptcha.getCaptchaScore).toHaveBeenCalledWith('ytrewsdfghjmnbgtyu')
    })

    it('returns BAD_REQUEST when extractRecaptchaToken throws', async () => {
      jest.mocked(events).extractRecaptchaToken.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postValidateClaimHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    it('returns BAD_REQUEST when extractClaimFromEvent throws an error', async () => {
      jest.mocked(events).extractClaimFromEvent.mockImplementationOnce(() => {
        throw new Error('Bad request')
      })
      const result = await postValidateClaimHandler(event)

      expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
    })

    it('returns FORBIDDEN when the reCAPTCHA score is too low', async () => {
      jest.mocked(recaptcha).getCaptchaScore.mockResolvedValueOnce(0.1)
      const result = await postValidateClaimHandler(event)

      expect(result).toEqual(expect.objectContaining(status.FORBIDDEN))
      expect(dynamodb.getPromptById).not.toHaveBeenCalled()
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
