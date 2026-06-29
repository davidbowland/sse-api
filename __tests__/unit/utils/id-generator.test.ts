import { randomInt } from 'crypto'

import { getNextId } from '@utils/id-generator'

jest.mock('@services/dynamodb')
jest.mock('crypto', () => ({
  randomInt: jest.fn(),
}))

const mockRandomInt = jest.mocked(randomInt)

describe('id-generator', () => {
  const mockGetById = jest.fn()

  describe('getNextId', () => {
    // allowedCharacters = '256789bcdfghjmnpqrstvwxz' (24 chars)
    // In test env: ID_MIN_LENGTH=1, ID_MAX_LENGTH=4
    // randomInt(1, 5) picks length; randomInt(24) picks each character index

    beforeAll(() => {
      mockGetById.mockRejectedValue(undefined)
    })

    it('should return id passed to getNextId', async () => {
      // length=4, indices 12('j'), 0('2'), 0('2'), 1('5') → 'j225'
      mockRandomInt
        .mockReturnValueOnce(4)
        .mockReturnValueOnce(12)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)

      const result = await getNextId(mockGetById)

      expect(result).toEqual('j225')
    })

    it('should return second id when first exists', async () => {
      // First attempt: 'j225' → exists
      // Second attempt: indices 6('b'), 0('2'), 0('2'), 1('5') → 'b225'
      mockGetById.mockResolvedValueOnce(undefined)
      mockRandomInt
        .mockReturnValueOnce(4)
        .mockReturnValueOnce(12)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(4)
        .mockReturnValueOnce(6)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1)

      const result = await getNextId(mockGetById)

      expect(result).toEqual('b225')
    })
  })
})
