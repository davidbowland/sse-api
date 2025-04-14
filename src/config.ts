import axios from 'axios'
import axiosRetry from 'axios-retry'

// Axios

axiosRetry(axios, { retries: 3 })

// Claims

export const suggestClaimsCount = parseInt(process.env.SUGGEST_CLAIMS_COUNT as string, 10)
export const suggestClaimsPromptId = process.env.SUGGEST_CLAIMS_PROMPT_ID as string
export const suggestClaimsUrl = process.env.SUGGEST_CLAIMS_URL as string

export const validateClaimPromptId = process.env.VALIDATE_CLAIM_PROMPT_ID as string

// DynamoDB

export const dynamodbPromptTableName = process.env.DYNAMODB_PROMPT_TABLE_NAME as string
export const dynamodbSessionTableName = process.env.DYNAMODB_SESSION_TABLE_NAME as string

// IDs

export const idMaxLength = parseInt(process.env.ID_MAX_LENGTH as string, 10)
export const idMinLength = parseInt(process.env.ID_MIN_LENGTH as string, 10)

// LLM response

export const responsePromptId = process.env.RESPONSE_PROMPT_ID as string

// Logging

export const debugLogging = (process.env.DEBUG_LOGGING as string) === 'true'

// Sessions

export const sessionExpireHours = parseInt(process.env.SESSION_EXPIRE_HOURS as string, 10)
