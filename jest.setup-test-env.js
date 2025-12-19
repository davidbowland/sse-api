// Claims

process.env.SUGGEST_CLAIMS_COUNT = '10'
process.env.SUGGEST_CLAIMS_PROMPT_ID = 'suggest-claims-prompt'
process.env.SUGGEST_CLAIMS_URL = 'https://a-great.claims-site'

process.env.VALIDATE_CLAIM_PROMPT_ID = 'validate-claim-prompt'

// DynamoDB

process.env.DYNAMODB_PROMPT_TABLE_NAME = 'prompt-table'
process.env.DYNAMODB_SESSION_TABLE_NAME = 'session-table'

// IDs

process.env.ID_MAX_LENGTH = '4'
process.env.ID_MIN_LENGTH = '1'

// LLM response

process.env.RESPONSE_PROMPT_ID = 'probe-confidence-prompt'

// Sessions

process.env.SESSION_EXPIRE_HOURS = '24'

// Transcribe

process.env.TRANSCRIBE_REGION = 'us-east-1'
process.env.TRANSCRIBE_URL_EXPIRATION_SECONDS = '3600'
