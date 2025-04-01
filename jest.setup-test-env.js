// Claims

process.env.SUGGEST_CLAIMS_COUNT = '10'
process.env.SUGGEST_CLAIMS_PROMPT_ID = 'suggest-claims-prompt'
process.env.SUGGEST_CLAIMS_URL = 'https://a-great.claims-site'

// DynamoDB

process.env.DYNAMODB_PROMPT_TABLE_NAME = 'prompt-table'
process.env.DYNAMODB_SESSION_TABLE_NAME = 'session-table'

// IDs

process.env.ID_MAX_LENGTH = '4'
process.env.ID_MIN_LENGTH = '1'

// Sessions

process.env.SESSION_EXPIRE_HOURS = '24'
