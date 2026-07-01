# reCAPTCHA Gate for Claim Endpoints Design

**Date:** 2026-07-01
**Status:** Approved

## Problem

`POST /suggest-claims` and `POST /validate-claim` are unauthenticated and invoke Bedrock on every call (Bedrock cost + LLM abuse surface). They need a bot-mitigation gate before doing any LLM work. `choosee-api` already solved this with reCAPTCHA v3 (score-based, no user interaction) gating `post-session`; this reuses that pattern, adapted to sse-api's conventions and dedicated to a new, separate reCAPTCHA v3 key pair (sse-api's domain differs from choosee's).

## Scope

Only `post-suggest-claims` and `post-validate-claim`. No other sse-api endpoint is touched.

## Components

### `src/services/recaptcha.ts` (new)

```ts
export const getCaptchaScore = async (token: string): Promise<number>
export const recaptchaMinScore = 0.7
```

`getCaptchaScore` POSTs `token` + `recaptchaSecretKey` to `https://www.google.com/recaptcha/api/siteverify` via axios, mirroring `choosee-api`'s implementation exactly (same request shape, same `logWarn` calls on missing score / failed verification, returns `0` in both failure cases). `recaptchaMinScore` is a single shared constant so both handlers apply the identical threshold without duplicating a magic number.

### `src/config.ts`

Add, under a new `// reCAPTCHA` section:

```ts
export const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY as string
```

### `src/utils/events.ts`

Add:

```ts
export const extractRecaptchaToken = (event: APIGatewayProxyEventV2): string => {
  const token = event.headers['x-recaptcha-token']
  if (!token) {
    throw new Error('x-recaptcha-token header is required')
  }
  return token
}
```

This throws a plain `Error`, consistent with every other `extract*` function in this file (e.g. `extractClaimFromEvent`) — no new error-class hierarchy is introduced.

### Handlers

Both `post-suggest-claims.ts` and `post-validate-claim.ts` get the same shape of change:

1. In the outer `try` (existing 400-on-`Error` block), extract the recaptcha token alongside the existing body parsing:

   ```ts
   const recaptchaToken = extractRecaptchaToken(event)
   const suggestClaimsRequest = extractSuggestClaimsRequestFromEvent(event) // (or extractClaimFromEvent)
   ```

   A missing header behaves exactly like a malformed body today: caught by the outer catch, returns `400` with `{ message }`.

2. At the top of the inner `try` (the block that currently does the Bedrock/DynamoDB work and returns 500 on failure), call the score check first:

   ```ts
   const score = await getCaptchaScore(recaptchaToken)
   log('reCAPTCHA result', { score })
   if (score < recaptchaMinScore) {
     return status.FORBIDDEN
   }
   ```

   This is a plain early `return`, not a thrown/caught error — it avoids introducing a `ForbiddenError` class (which `choosee-api` uses but sse-api has no precedent for) and avoids the inner catch mislabeling a low score as an unexpected 500.

3. The rest of each handler (cache lookup / Bedrock invocation / response shaping) is unchanged.

Net effect: a request without a valid, high-scoring recaptcha token never reaches Bedrock or DynamoDB for these two endpoints.

## Deployment

Mirrors `choosee-api`'s existing setup exactly:

### `template.yaml`

- New parameter:

  ```yaml
  RecaptchaSecretKey:
    Type: String
    Description: Secret key for reCAPTCHA v3
    NoEcho: true
  ```

- Add `RECAPTCHA_SECRET_KEY: !Ref RecaptchaSecretKey` to the `Environment.Variables` of both `PostSuggestClaimsFunction` and `PostValidateClaimFunction`.
- Add `X-Recaptcha-Token` to the `HttpApi.CorsConfiguration.AllowHeaders` list (alongside the existing `X-Twitch-Token`).

### `.github/workflows/pipeline.yaml`

- Add `RECAPTCHA_SECRET_KEY: ${{ secrets.RECAPTCHA_SECRET_KEY }}` to the top-level `env:` block.
- Append `RecaptchaSecretKey=${RECAPTCHA_SECRET_KEY}` to all three `--parameter-overrides` strings (feature-branch test deploy, `deploy-testing`, `deploy-prod`).

### Manual step (outside this repo, owned by the user)

- Register a new reCAPTCHA v3 site (separate from choosee-api's) in the Google account tied to the sse domain(s), and add its secret key as the `RECAPTCHA_SECRET_KEY` GitHub Actions secret on the sse-api repo. This does not block writing/merging the code itself, but **the deploy itself will succeed even if the secret is unset or empty** — CloudFormation happily accepts an empty string for a parameter with no `Default`. An empty/missing secret does not fail the deploy; it makes `getCaptchaScore` post `secret: ''` to Google on every request, which Google rejects, so every legitimate request gets a false `403 FORBIDDEN`. That is a full outage of both endpoints for real users, not merely a blocked deploy. **Do not deploy to test/prod until the secret is actually set** — sequence the manual step before (or atomically with) the first deploy of this branch, not just before merge.

### `endpoints.rest`

Add an `x-recaptcha-token` header line to the two example requests for `/suggest-claims` and `/validate-claim`.

## Testing

- New `__tests__/unit/services/recaptcha.test.ts`, structurally identical to `choosee-api`'s: mocked axios, asserts the request shape, and covers success / missing-score / failed-verification-with-and-without-error-codes cases. `beforeAll` sets the default resolved mock; each edge case uses `mockResolvedValueOnce`.
- Extend `__tests__/unit/utils/events.test.ts` with cases for `extractRecaptchaToken`: present header → returns token; absent header → throws.
- Extend `__tests__/unit/handlers/post-suggest-claims.test.ts` and `post-validate-claim.test.ts`:
  - Missing `x-recaptcha-token` header → 400.
  - `getCaptchaScore` resolves below `0.7` → 403, and the downstream service (`getCachedOrGenerateClaims` / `invokeModel`) is **not** called.
  - `getCaptchaScore` resolves at/above `0.7` → existing 200 behavior unchanged.
- All new/changed tests follow this repo's rules: no `beforeEach`, no `if` in test bodies, `clearMocks` relied on, shared defaults in `beforeAll`, per-test overrides via `mockResolvedValueOnce`.

## Out of Scope

- No changes to any other endpoint.
- No configurable/env-driven score threshold — `0.7` is a code constant, matching `choosee-api`'s precedent.
- No frontend changes (site-key wiring, widget/`grecaptcha.execute()` calls) — this repo is API-only.
