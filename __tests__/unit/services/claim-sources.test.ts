import axios from 'axios'

import { claimSources, claimSourcesRaw } from '../__mocks__'
import { getClaimSources } from '@services/claim-sources'
import { getSuggestClaimsUrl } from '@services/secrets'

jest.mock('axios')
jest.mock('@services/secrets')

describe('claim-sources', () => {
  describe('getClaimSources', () => {
    beforeAll(() => {
      jest.mocked(axios).get.mockResolvedValue({ data: claimSourcesRaw })
      jest.mocked(getSuggestClaimsUrl).mockResolvedValue('https://a-great.claims-site')
    })

    it('should return a list of claim sources', async () => {
      const result = await getClaimSources()

      expect(result).toEqual(claimSources)
      expect(axios.get).toHaveBeenCalledWith('https://a-great.claims-site')
    })
  })
})
