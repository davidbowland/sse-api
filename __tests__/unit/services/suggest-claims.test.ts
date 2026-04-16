import { claimSources, invokeModelSuggestClaims, prompt } from '../__mocks__'
import * as bedrock from '@services/bedrock'
import * as claimSourcesService from '@services/claim-sources'
import * as dynamodb from '@services/dynamodb'
import { getCachedOrGenerateClaims } from '@services/suggest-claims'

jest.mock('@services/bedrock')
jest.mock('@services/claim-sources')
jest.mock('@services/dynamodb')
jest.mock('@utils/logging')
jest.mock('@config', () => ({
  suggestClaimsCacheHours: 4,
  suggestClaimsGenerationStaleSeconds: 180,
  suggestClaimsPollDeadlineSeconds: 30,
  suggestClaimsPromptId: 'suggest-claims',
}))

describe('suggest-claims', () => {
  // Fixed time: 2026-04-16T12:00:00Z
  const fixedNowMs = 1776340800000
  const fixedNowSeconds = Math.floor(fixedNowMs / 1000)
  const dateKeyEnUS = '2026-04-16#en-US'
  const dateKeyFrFR = '2026-04-16#fr-FR'

  beforeEach(() => {
    jest.useFakeTimers({ now: fixedNowMs })
    jest.mocked(bedrock).invokeModel.mockResolvedValue({ suggestions: invokeModelSuggestClaims })
    jest.mocked(claimSourcesService).getClaimSources.mockResolvedValue(claimSources)
    jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
    jest.mocked(dynamodb).setSuggestClaims.mockResolvedValue({} as any)
    jest.mocked(dynamodb).setGeneratingSuggestClaims.mockResolvedValue(fixedNowSeconds)
    jest.mocked(dynamodb).deleteGeneratingSuggestClaims.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const flushPromises = (): Promise<void> =>
    new Promise((resolve) => jest.requireActual<typeof globalThis>('timers').setImmediate(resolve))

  describe('getCachedOrGenerateClaims', () => {
    it('returns cached claims when fresh completed record exists', async () => {
      const freshCreatedAt = fixedNowSeconds - 2 * 60 * 60 // 2 hours ago
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce({
        claims: invokeModelSuggestClaims,
        createdAt: freshCreatedAt,
        generating: false,
        language: 'en-US',
      })

      const result = await getCachedOrGenerateClaims('en-US')

      expect(result).toEqual(invokeModelSuggestClaims)
      expect(dynamodb.getLatestSuggestClaims).toHaveBeenCalledWith(dateKeyEnUS)
      expect(bedrock.invokeModel).not.toHaveBeenCalled()
      expect(dynamodb.setSuggestClaims).not.toHaveBeenCalled()
    })

    it('generates new claims when cached record is stale', async () => {
      const staleCreatedAt = fixedNowSeconds - 5 * 60 * 60 // 5 hours ago
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce({
        claims: ['old claim'],
        createdAt: staleCreatedAt,
        generating: false,
        language: 'en-US',
      })

      const result = await getCachedOrGenerateClaims('en-US')

      expect(result).toEqual(invokeModelSuggestClaims)
      expect(dynamodb.setGeneratingSuggestClaims).toHaveBeenCalledWith(dateKeyEnUS, 'en-US')
      expect(bedrock.invokeModel).toHaveBeenCalled()
    })

    it('generates new claims when no cached record exists', async () => {
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce(undefined)

      const result = await getCachedOrGenerateClaims('en-US')

      expect(result).toEqual(invokeModelSuggestClaims)
      expect(dynamodb.setGeneratingSuggestClaims).toHaveBeenCalledWith(dateKeyEnUS, 'en-US')
      expect(bedrock.invokeModel).toHaveBeenCalled()
    })

    it('uses language in the date key', async () => {
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce(undefined)

      await getCachedOrGenerateClaims('fr-FR')

      expect(dynamodb.getLatestSuggestClaims).toHaveBeenCalledWith(dateKeyFrFR)
      expect(bedrock.invokeModel).toHaveBeenCalledWith(prompt, claimSources.join('\n'), { language: 'fr-FR' })
    })

    it('does not fail the response when cache write fails', async () => {
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce(undefined)
      jest.mocked(dynamodb).setSuggestClaims.mockRejectedValueOnce(new Error('DynamoDB throttle'))

      const result = await getCachedOrGenerateClaims('en-US')

      expect(result).toEqual(invokeModelSuggestClaims)
    })

    it('attempts to delete generating placeholder when cache write fails', async () => {
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce(undefined)
      jest.mocked(dynamodb).setSuggestClaims.mockRejectedValueOnce(new Error('DynamoDB throttle'))

      await getCachedOrGenerateClaims('en-US')
      await flushPromises()

      expect(dynamodb.deleteGeneratingSuggestClaims).toHaveBeenCalledWith(dateKeyEnUS, fixedNowSeconds)
    })

    it('waits for in-progress generation from another request', async () => {
      const recentCreatedAt = fixedNowSeconds - 10 // 10 seconds ago, still generating
      jest
        .mocked(dynamodb)
        .getLatestSuggestClaims.mockResolvedValueOnce({
          createdAt: recentCreatedAt,
          generating: true,
          language: 'en-US',
        })
        .mockResolvedValueOnce({
          claims: invokeModelSuggestClaims,
          createdAt: recentCreatedAt,
          generating: false,
          language: 'en-US',
        })

      const promise = getCachedOrGenerateClaims('en-US')
      await jest.advanceTimersByTimeAsync(2_000)
      const result = await promise

      expect(result).toEqual(invokeModelSuggestClaims)
      expect(bedrock.invokeModel).not.toHaveBeenCalled()
    })

    it('regenerates when generating record is stale', async () => {
      const staleGeneratingCreatedAt = fixedNowSeconds - 200 // 200 seconds ago, past 180s threshold
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce({
        createdAt: staleGeneratingCreatedAt,
        generating: true,
        language: 'en-US',
      })

      const result = await getCachedOrGenerateClaims('en-US')

      expect(result).toEqual(invokeModelSuggestClaims)
      expect(dynamodb.setGeneratingSuggestClaims).toHaveBeenCalled()
      expect(bedrock.invokeModel).toHaveBeenCalled()
    })

    it('passes createdAt from setGeneratingSuggestClaims to setSuggestClaims', async () => {
      jest.mocked(dynamodb).getLatestSuggestClaims.mockResolvedValueOnce(undefined)

      await getCachedOrGenerateClaims('en-US')

      expect(dynamodb.setSuggestClaims).toHaveBeenCalledWith(
        dateKeyEnUS,
        fixedNowSeconds,
        invokeModelSuggestClaims,
        'en-US',
      )
    })
  })
})
