import {
  suggestClaimsCacheHours,
  suggestClaimsGenerationStaleSeconds,
  suggestClaimsPollDeadlineSeconds,
  suggestClaimsPromptId,
} from '../config'
import { SuggestClaimsResponse } from '../types'
import { log, logError } from '../utils/logging'
import { invokeModel } from './bedrock'
import { getClaimSources } from './claim-sources'
import {
  deleteGeneratingSuggestClaims,
  getLatestSuggestClaims,
  getPromptById,
  setGeneratingSuggestClaims,
  setSuggestClaims,
} from './dynamodb'

const POLL_INTERVAL_MS = 2_000

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

// DateKey encodes both date and language so each locale gets its own cache partition
const getDateKey = (language: string): string => {
  const date = new Date().toISOString().slice(0, 10) // UTC YYYY-MM-DD
  return `${date}#${language}`
}

const isFresh = (createdAtSeconds: number): boolean =>
  nowSeconds() - createdAtSeconds < suggestClaimsCacheHours * 60 * 60

const isGenerationStale = (createdAtSeconds: number): boolean =>
  nowSeconds() - createdAtSeconds > suggestClaimsGenerationStaleSeconds

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const waitForGeneration = async (dateKey: string): Promise<string[] | undefined> => {
  const deadline = Date.now() + suggestClaimsPollDeadlineSeconds * 1000
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    const record = await getLatestSuggestClaims(dateKey)
    if (record && !record.generating && record.claims) {
      return record.claims
    }
    if (!record || isGenerationStale(record.createdAt)) {
      return undefined
    }
  }
  return undefined
}

const generateAndCache = async (dateKey: string, language: string): Promise<string[]> => {
  const createdAt = await setGeneratingSuggestClaims(dateKey, language)

  const claimSources = await getClaimSources()
  const prompt = await getPromptById(suggestClaimsPromptId)
  const response = await invokeModel<SuggestClaimsResponse>(prompt, claimSources.join('\n'), { language })

  // Fire-and-forget: clean up the placeholder on failure, don't break the response either way
  setSuggestClaims(dateKey, createdAt, response.suggestions, language).catch((error) => {
    logError('Failed to cache suggest claims, attempting placeholder cleanup', error)
    deleteGeneratingSuggestClaims(dateKey, createdAt).catch((deleteError) =>
      logError('Failed to cache and failed to clean up placeholder', { cacheError: error, deleteError }),
    )
  })

  log('Generated new suggest claims', { dateKey, count: response.suggestions.length })
  return response.suggestions
}

export const getCachedOrGenerateClaims = async (language: string): Promise<string[]> => {
  const dateKey = getDateKey(language)
  const cached = await getLatestSuggestClaims(dateKey)

  // Fresh completed record — return immediately
  if (cached && !cached.generating && cached.claims && isFresh(cached.createdAt)) {
    log('Returning cached suggest claims', { dateKey, createdAt: cached.createdAt })
    return cached.claims
  }

  // Another request is actively generating — wait for it
  if (cached?.generating && !isGenerationStale(cached.createdAt)) {
    log('Waiting for in-progress generation', { dateKey })
    const claims = await waitForGeneration(dateKey)
    if (claims) return claims
  }

  log('Generating new suggest claims', { dateKey, language })
  return generateAndCache(dateKey, language)
}
