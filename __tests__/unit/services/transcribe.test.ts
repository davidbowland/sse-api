import { sessionId } from '../__mocks__'
import * as dynamodb from '@services/dynamodb'
import { createStreamingSession } from '@services/transcribe'
import * as idGenerator from '@utils/id-generator'

const mockSign = jest.fn()
jest.mock('@aws-sdk/signature-v4-multi-region', () => ({
  SignatureV4MultiRegion: jest.fn(() => ({
    sign: mockSign,
  })),
}))

jest.mock('@aws-sdk/client-transcribe-streaming', () => ({
  TranscribeStreamingClient: jest.fn(() => ({
    config: {
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    },
  })),
}))

jest.mock('@services/dynamodb')
jest.mock('@utils/id-generator')
jest.mock('@utils/logging', () => ({
  xrayCapture: jest.fn().mockImplementation((x) => x),
}))

describe('transcribe', () => {
  describe('createStreamingSession', () => {
    beforeAll(() => {
      jest.mocked(dynamodb).setSessionById.mockResolvedValue({} as any)
      jest.mocked(idGenerator).getNextId.mockResolvedValue('stream123')
      mockSign.mockResolvedValue({
        headers: { 'X-Amz-Signature': 'example' },
      })
    })

    it('should create streaming session with default parameters', async () => {
      const result = await createStreamingSession(sessionId)

      expect(dynamodb.setSessionById).toHaveBeenCalledWith(sessionId, {
        transcribeSession: expect.objectContaining({
          languageCode: 'en-US',
          mediaFormat: 'pcm',
          sampleRate: 16000,
          sessionId: 'stream123',
          status: 'active',
        }),
      })
      expect(result).toEqual(
        expect.objectContaining({
          expiresIn: 3600,
          languageCode: 'en-US',
          mediaFormat: 'pcm',
          sampleRate: 16000,
          sessionId: 'stream123',
        }),
      )
      expect(result.websocketUrl).toContain('wss://transcribestreaming.us-east-1.amazonaws.com')
    })

    it('should create streaming session with custom parameters', async () => {
      const result = await createStreamingSession(sessionId, 'es-US', 44100, 'flac')

      expect(result).toEqual(
        expect.objectContaining({
          languageCode: 'es-US',
          mediaFormat: 'flac',
          sampleRate: 44100,
          sessionId: 'stream123',
        }),
      )
    })

    it('should throw error for unsupported language code', async () => {
      await expect(createStreamingSession(sessionId, 'invalid-lang')).rejects.toThrow(
        'Unsupported language code: invalid-lang',
      )
    })

    it('should throw error for unsupported sample rate', async () => {
      await expect(createStreamingSession(sessionId, 'en-US', 12000)).rejects.toThrow('Unsupported sample rate: 12000')
    })

    it('should throw error for unsupported media format', async () => {
      await expect(createStreamingSession(sessionId, 'en-US', 16000, 'mp3' as any)).rejects.toThrow(
        'Unsupported media format: mp3',
      )
    })
  })
})
