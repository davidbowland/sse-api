import { createStreamingSession } from '@services/transcribe'

const mockSign = jest.fn()
jest.mock('@aws-sdk/signature-v4-multi-region', () => ({
  SignatureV4MultiRegion: jest.fn(() => ({
    sign: mockSign,
  })),
}))

jest.mock('@aws-sdk/client-transcribe-streaming', () => ({
  TranscribeStreamingClient: jest.fn(() => ({
    config: {
      credentials: jest.fn().mockResolvedValue({
        accessKeyId: 'test',
        secretAccessKey: 'test',
        sessionToken: 'test-token',
      }),
    },
  })),
}))

jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('transcribe', () => {
  describe('createStreamingSession', () => {
    beforeAll(() => {
      mockSign.mockResolvedValue({
        headers: {
          authorization:
            'AWS4-HMAC-SHA256 Credential=test/20240101/us-east-1/transcribe/aws4_request, SignedHeaders=host, Signature=abcdef123456',
        },
      })
    })

    it('should create streaming session with provided parameters', async () => {
      const result = await createStreamingSession('en-US', 16000, 'pcm')

      expect(result).toEqual(
        expect.objectContaining({
          expiresIn: 3600,
          languageCode: 'en-US',
          mediaFormat: 'pcm',
          sampleRate: 16000,
        }),
      )
      expect(result.websocketUrl).toContain('wss://transcribestreaming.us-east-1.amazonaws.com')
    })

    it('should create streaming session with different parameters', async () => {
      const result = await createStreamingSession('es-US', 44100, 'flac')

      expect(result).toEqual(
        expect.objectContaining({
          languageCode: 'es-US',
          mediaFormat: 'flac',
          sampleRate: 44100,
        }),
      )
    })
  })
})
