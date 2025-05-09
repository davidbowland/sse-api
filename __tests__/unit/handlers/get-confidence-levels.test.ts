import { confidenceLevels } from '@assets/confidence-levels'
import eventJson from '@events/get-confidence-levels.json'
import { getConfidenceLevelsHandler } from '@handlers/get-confidence-levels'
import { APIGatewayProxyEventV2 } from '@types'
import status from '@utils/status'

jest.mock('@utils/logging')

describe('get-confidence-levels', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  describe('getConfidenceLevelsHandler', () => {
    it('should return confidence levels', async () => {
      const result = await getConfidenceLevelsHandler(event)

      expect(result).toEqual(expect.objectContaining(status.OK))
      expect(JSON.parse(result.body)).toEqual({ confidenceLevels })
    })
  })
})
