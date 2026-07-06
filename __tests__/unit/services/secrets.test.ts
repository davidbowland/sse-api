import { getRecaptchaSecretKey, getSuggestClaimsUrl } from '@services/secrets'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-ssm', () => ({
  GetParameterCommand: jest.fn().mockImplementation((x) => x),
  SSM: jest.fn(() => ({
    send: (...args: any[]) => mockSend(...args),
  })),
}))
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

const TTL_MS = 10 * 60 * 1000

describe('secrets', () => {
  beforeAll(() => {
    mockSend.mockResolvedValue({ Parameter: { Value: 'fetched-value' } })
  })

  describe('getRecaptchaSecretKey', () => {
    it('should fetch the /sse/recaptcha-secret-key parameter with decryption', async () => {
      await getRecaptchaSecretKey(() => 1_000_000)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ Name: '/sse/recaptcha-secret-key', WithDecryption: true }),
      )
    })

    it('should return the fetched value', async () => {
      const result = await getRecaptchaSecretKey(() => 1_000_000)
      expect(result).toEqual('fetched-value')
    })

    it('should not call SSM again when the cached value has not expired', async () => {
      await getRecaptchaSecretKey(() => 1_000_000)
      const callsAfterFirstFetch = mockSend.mock.calls.length
      await getRecaptchaSecretKey(() => 1_000_001)
      expect(mockSend.mock.calls.length).toBe(callsAfterFirstFetch)
    })

    it('should call SSM again when the cached value has expired', async () => {
      await getRecaptchaSecretKey(() => 1_000_000)
      const callsAfterFirstFetch = mockSend.mock.calls.length
      await getRecaptchaSecretKey(() => 1_000_000 + TTL_MS + 1)
      expect(mockSend.mock.calls.length).toBeGreaterThan(callsAfterFirstFetch)
    })

    it('should propagate the error when the SSM call fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('ParameterNotFound'))
      await expect(getRecaptchaSecretKey(() => 4_000_000)).rejects.toThrow('ParameterNotFound')
    })

    it('should throw and not cache when SSM returns a response with no parameter value', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: {} })
      await expect(getRecaptchaSecretKey(() => 10_000_000)).rejects.toThrow('/sse/recaptcha-secret-key has no value')
    })
  })

  describe('getSuggestClaimsUrl', () => {
    it('should fetch the /sse/suggest-claims-url parameter with decryption', async () => {
      await getSuggestClaimsUrl(() => 2_000_000)
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ Name: '/sse/suggest-claims-url', WithDecryption: true }),
      )
    })
  })
})
