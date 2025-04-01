import axios from 'axios'

import { suggestClaimsCount, suggestClaimsUrl } from '../config'

const isValidTitle = (title: string): boolean => title.indexOf(' ') > 0

export const getClaimSources = async () => {
  const result = await axios.get(suggestClaimsUrl)
  const titles = Array.from(result.data.matchAll(/\\"title\\":\\"(.*?)\\"/g))
  const sources = titles.reduce((acc: Set<string>, match: any) => {
    const title = match[1]
    if (isValidTitle(title)) {
      acc.add(title)
    }
    return acc
  }, new Set())
  return Array.from(sources).slice(0, suggestClaimsCount) // Sources tend to duplicate more the more sources we allow
}
