import { randomInt } from 'crypto'

import { idMaxLength, idMinLength } from '../config'

// Don't allow vowels, digits that look like vowels, or ambiguous characters
const allowedCharacters = '256789bcdfghjmnpqrstvwxz'

type GetById = (id: string) => Promise<unknown>

const idExists = async (id: string, getById: GetById): Promise<boolean> => {
  try {
    await getById(id)
    return true
  } catch (error: unknown) {
    return false
  }
}

const getRandomId = async (getById: GetById): Promise<string> => {
  const length = randomInt(idMinLength, idMaxLength + 1)
  const id = Array.from({ length }, () => allowedCharacters[randomInt(allowedCharacters.length)]).join('')
  if (await idExists(id, getById)) {
    return getRandomId(getById)
  }
  return id
}

export const getNextId = async (getById: GetById): Promise<string> => getRandomId(getById)
