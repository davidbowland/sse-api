import { idMaxLength, idMinLength } from '../config'

// Don't allow vowells, digits that look like vowells, or ambiguous characters
const allowedCharacters = '256789bcdfghjmnpqrstvwxz'

type GetById = (id: string) => Promise<unknown>

const valueToId = (value: number): string => {
  const digit = allowedCharacters.charAt(value % allowedCharacters.length)
  return value >= allowedCharacters.length ? valueToId(Math.floor(value / allowedCharacters.length)) + digit : digit
}

const idExists = async (id: string, getById: GetById): Promise<boolean> => {
  try {
    await getById(id)
    return true
  } catch (error: unknown) {
    return false
  }
}

const getRandomId = async (minValue: number, maxValue: number, getById: GetById): Promise<string> => {
  const randomValue = Math.round(Math.random() * (maxValue - minValue) + minValue)
  const id = valueToId(randomValue)
  if (await idExists(id, getById)) {
    return getRandomId(minValue, maxValue, getById)
  }
  return id
}

export const getNextId = async (getById: GetById): Promise<string> => {
  const minValue = Math.pow(allowedCharacters.length, idMinLength - 1)
  const maxValue = Math.pow(allowedCharacters.length, idMaxLength)
  return getRandomId(minValue, maxValue, getById)
}
