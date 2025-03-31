import { getNextId } from '@utils/id-generator'

jest.mock('@services/dynamodb')

describe('id-generator', () => {
  const mockGetById = jest.fn()
  const mockRandom = jest.fn()

  beforeAll(() => {
    Math.random = mockRandom.mockReturnValue(0.5)
  })

  describe('getNextId', () => {
    beforeAll(() => {
      mockGetById.mockRejectedValue(undefined)
    })

    it('should return id passed to getNextId', async () => {
      const result = await getNextId(mockGetById)
      expect(result).toEqual('j225')
    })

    it('should return second id when first exists', async () => {
      mockGetById.mockResolvedValueOnce(undefined)
      mockRandom.mockReturnValueOnce(0.5)
      mockRandom.mockReturnValueOnce(0.25)
      const result = await getNextId(mockGetById)
      expect(result).toEqual('b225')
    })
  })
})
