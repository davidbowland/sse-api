import { Sha256 } from '@aws-crypto/sha256-js'
import { TranscribeStreamingClient } from '@aws-sdk/client-transcribe-streaming'
import { SignatureV4MultiRegion } from '@aws-sdk/signature-v4-multi-region'

import { transcribeRegion, transcribeUrlExpirationSeconds } from '../config'
import { TranscribeStreamingResponse } from '../types'
import { xrayCapture } from '../utils/logging'

const transcribeClient = xrayCapture(new TranscribeStreamingClient({ region: transcribeRegion }))

export const createStreamingSession = async (
  languageCode: string,
  sampleRate: number,
  mediaFormat: 'pcm' | 'ogg-opus' | 'flac',
): Promise<TranscribeStreamingResponse> => {
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

  return {
    expiresIn: transcribeUrlExpirationSeconds,
    languageCode,
    mediaFormat,
    sampleRate,
    websocketUrl,
  }
}
