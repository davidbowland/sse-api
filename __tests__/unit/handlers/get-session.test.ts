import eventJson from '@events/get-session.json'
import { getSessionHandler } from '@handlers/get-session'
import * as dynamodb from '@services/dynamodb'
import { APIGatewayProxyEventV2 } from '@types'
import status from '@utils/status'

import { session } from '../__mocks__'

jest.mock('@services/dynamodb')
jest.mock('@utils/logging')

describe('get-session', () => {
  const event = eventJson as unknown as APIGatewayProxyEventV2

  beforeAll(() => {
    jest.mocked(dynamodb).getSessionById.mockResolvedValue(session)
  })

  describe('getSessionHandler', () => {
    it('should return session', async () => {
      const result = await getSessionHandler(event)

      expect(result).toEqual({
        ...status.OK,
        body: JSON.stringify(session),
      })
    })

    it("should return NOT_FOUND when the session doesn't exist", async () => {
      jest.mocked(dynamodb).getSessionById.mockRejectedValueOnce(undefined)
      const result = await getSessionHandler(event)

      expect(result).toEqual(status.NOT_FOUND)
    })
  })
})
