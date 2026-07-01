import axios from 'axios'

import { recaptchaSecretKey } from '../config'
import { logWarn } from '../utils/logging'

const google = axios.create({
  baseURL: 'https://www.google.com/',
})

interface RecaptchaResponse {
  success: boolean
  score?: number
  action?: string
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

export const recaptchaMinScore = 0.7

export const getCaptchaScore = async (token: string): Promise<number> => {
  const response = await google.post<RecaptchaResponse>(
    'recaptcha/api/siteverify',
    {},
    {
      params: {
        response: token,
        secret: recaptchaSecretKey,
      },
    },
  )
  const { success, score } = response.data
  if (!success) {
    const errorCodes = response.data['error-codes'] ?? []
    logWarn('reCAPTCHA verification failed', { success, errorCodes })
    return 0
  }
  if (typeof score !== 'number') {
    logWarn('reCAPTCHA response missing score', { data: response.data })
    return 0
  }
  return score
}
