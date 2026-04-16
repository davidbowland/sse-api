// Claims

process.env.SUGGEST_CLAIMS_COUNT = '10'
process.env.SUGGEST_CLAIMS_PROMPT_ID = 'suggest-claims-prompt'
process.env.SUGGEST_CLAIMS_URL = 'https://a-great.claims-site'

process.env.VALIDATE_CLAIM_PROMPT_ID = 'validate-claim-prompt'

// DynamoDB

process.env.DYNAMODB_PROMPT_TABLE_NAME = 'prompt-table'
process.env.DYNAMODB_SESSION_TABLE_NAME = 'session-table'
process.env.DYNAMODB_SUGGEST_CLAIMS_TABLE_NAME = 'suggest-claims-table'

// Suggest claims cache

process.env.SUGGEST_CLAIMS_CACHE_HOURS = '4'
process.env.SUGGEST_CLAIMS_GENERATION_STALE_SECONDS = '180'
process.env.SUGGEST_CLAIMS_POLL_DEADLINE_SECONDS = '30'

// IDs

process.env.ID_MAX_LENGTH = '4'
process.env.ID_MIN_LENGTH = '1'

// LLM response

process.env.RESPONSE_PROMPT_ID = 'probe-confidence-prompt'

// Sessions

process.env.SESSION_EXPIRE_HOURS = '24'
