import axios from 'axios'

import { claimSources, claimSourcesRaw } from '../__mocks__'
import { getClaimSources } from '@services/claim-sources'

jest.mock('axios')

describe('claim-sources', () => {
  describe('getClaimSources', () => {
    beforeAll(() => {
      jest.mocked(axios).get.mockResolvedValue({ data: claimSourcesRaw })
    })

    it('should return a list of claim sources', async () => {
      const result = await getClaimSources()

      expect(result).toEqual(claimSources)
      expect(axios.get).toHaveBeenCalledWith('https://a-great.claims-site')
    })
  })
})
