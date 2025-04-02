#!/usr/bin/env bash

# Stop immediately on error
set -e

if [[ -z "$1" ]]; then
  $(./scripts/assumeDeveloperRole.sh)
fi

# Only install production modules
export NODE_ENV=production

# Build the project
SAM_TEMPLATE=template.yaml
sam build --template ${SAM_TEMPLATE}

# Start the API locally
export DYNAMODB_PROMPT_TABLE_NAME=sse-api-prompts
export SUGGEST_CLAIMS_COUNT=20
export SUGGEST_CLAIMS_PROMPT_ID=suggest-claims
# export SUGGEST_CLAIMS_URL: !Ref SuggestClaimsUrl
export VALIDATE_CLAIM_PROMPT_ID=validate-claim
sam local start-api --region=us-east-2 --force-image-build --parameter-overrides "Environment=test SuggestClaimsUrl=${SUGGEST_CLAIMS_URL}" --log-file local.log
