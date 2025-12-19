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
  const credentials = await transcribeClient.config.credentials()
  const signer = new SignatureV4MultiRegion({
    credentials,
    region: transcribeRegion,
    service: 'transcribe',
    sha256: Sha256,
  })

  const endpoint = `wss://transcribestreaming.${transcribeRegion}.amazonaws.com:8443/stream-transcription-websocket`
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const credentialScope = `${amzDate.slice(0, 8)}/${transcribeRegion}/transcribe/aws4_request`

  const queryParams = new URLSearchParams({
    'language-code': languageCode,
    'media-encoding': mediaFormat,
    'sample-rate': `${sampleRate}`,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': `${transcribeUrlExpirationSeconds}`,
    'X-Amz-SignedHeaders': 'host',
  })

  if (credentials.sessionToken) {
    queryParams.set('X-Amz-Security-Token', credentials.sessionToken)
  }

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
  const authHeader = signedRequest.headers?.['authorization'] || ''
  const signatureMatch = authHeader.match(/Signature=([a-f0-9]+)/)
  const signature = signatureMatch ? signatureMatch[1] : ''

  queryParams.set('X-Amz-Signature', signature)
  const websocketUrl = `${endpoint}?${queryParams.toString()}`

  return {
    expiresIn: transcribeUrlExpirationSeconds,
    languageCode,
    mediaFormat,
    sampleRate,
    websocketUrl,
  }
}
