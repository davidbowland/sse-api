import { Sha256 } from '@aws-crypto/sha256-js'
import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming'
import { SignatureV4MultiRegion } from '@aws-sdk/signature-v4-multi-region'

import { transcribeRegion, transcribeUrlExpirationSeconds } from '../config'
import { SessionId, TranscribeSession, TranscribeStreamingResponse } from '../types'
import { getNextId } from '../utils/id-generator'
import { xrayCapture } from '../utils/logging'
import { setSessionById } from './dynamodb'

const transcribeClient = xrayCapture(new TranscribeStreamingClient({ region: transcribeRegion }))

const SUPPORTED_LANGUAGES = ['en-US', 'en-GB', 'es-US', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT', 'ja-JP', 'ko-KR', 'zh-CN']
const SUPPORTED_SAMPLE_RATES = [8000, 16000, 22050, 44100, 48000]
const SUPPORTED_MEDIA_FORMATS = ['pcm', 'ogg-opus', 'flac'] as const

export const createStreamingSession = async (
  parentSessionId: SessionId,
  languageCode: string = 'en-US',
  sampleRate: number = 16000,
  mediaFormat: 'pcm' | 'ogg-opus' | 'flac' = 'pcm',
): Promise<TranscribeStreamingResponse> => {
  if (!SUPPORTED_LANGUAGES.includes(languageCode)) {
    throw new Error(`Unsupported language code: ${languageCode}`)
  }

  if (!SUPPORTED_SAMPLE_RATES.includes(sampleRate)) {
    throw new Error(`Unsupported sample rate: ${sampleRate}. Supported rates: ${SUPPORTED_SAMPLE_RATES.join(', ')}`)
  }

  if (!SUPPORTED_MEDIA_FORMATS.includes(mediaFormat)) {
    throw new Error(`Unsupported media format: ${mediaFormat}`)
  }

  const streamingSessionId = await getNextId(async () => {
    throw new Error('Not found')
  })
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + transcribeUrlExpirationSeconds

  const signer = new SignatureV4MultiRegion({
    credentials: transcribeClient.config.credentials,
    region: transcribeRegion,
    service: 'transcribe',
    sha256: Sha256,
  })

  const endpoint = `wss://transcribestreaming.${transcribeRegion}.amazonaws.com:8443/stream-transcription-websocket`
  const queryParams = new URLSearchParams({
    'language-code': languageCode,
    'media-encoding': mediaFormat,
    'sample-rate': sampleRate.toString(),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''),
    'X-Amz-Expires': transcribeUrlExpirationSeconds.toString(),
    'X-Amz-SignedHeaders': 'host',
  })

  const request = {
    headers: {
      host: `transcribestreaming.${transcribeRegion}.amazonaws.com:8443`,
    },
    hostname: `transcribestreaming.${transcribeRegion}.amazonaws.com`,
    method: 'GET',
    path: `/stream-transcription-websocket?${queryParams.toString()}`,
    port: 8443,
    protocol: 'wss:',
  }

  const signedRequest = await signer.sign(request)
  const websocketUrl = `${endpoint}?${queryParams.toString()}&X-Amz-Signature=${signedRequest.headers?.['X-Amz-Signature'] || ''}`

  const transcribeSession: TranscribeSession = {
    createdAt: now,
    expiresAt,
    languageCode,
    mediaFormat,
    sampleRate,
    sessionId: streamingSessionId,
    status: 'active',
    websocketUrl,
  }

  await setSessionById(parentSessionId, { transcribeSession } as any)

  return {
    expiresIn: transcribeUrlExpirationSeconds,
    languageCode,
    mediaFormat,
    sampleRate,
    sessionId: streamingSessionId,
    websocketUrl,
  }
}
