# reCAPTCHA Gate for Claim Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a verified reCAPTCHA v3 token (score >= 0.7) on `POST /suggest-claims` and `POST /validate-claim` before either endpoint does any Bedrock/DynamoDB work.

**Architecture:** A new `src/services/recaptcha.ts` module calls Google's `siteverify` API to get a score for a client-supplied token (read from the `x-recaptcha-token` header via a new `extractRecaptchaToken` in `src/utils/events.ts`). Both handlers extract the token during their existing body-parsing step (missing header -> existing 400 path) and, before doing their real work, fetch the score and return `403 FORBIDDEN` early if it's below the shared `recaptchaMinScore` constant. Deployment plumbing (SAM parameter, Lambda env var, CORS header, pipeline secret) mirrors the existing `choosee-api` implementation.

**Tech Stack:** TypeScript, Jest, axios (already a dependency), AWS SAM/CloudFormation, GitHub Actions.

## Global Constraints

- Jest `clearMocks: true` is on — never manually clear mocks.
- No `beforeEach` in tests — use `beforeAll` for shared defaults, `mockReturnValueOnce`/`mockResolvedValueOnce`/`mockRejectedValueOnce` for per-test overrides, and a named `setup()` function only if repeated arrangement is truly needed.
- No `if` statements, no live `Date.now()`/`Math.random()` calls, and no wall-clock-dependent date arithmetic inside test bodies.
- `extractRecaptchaToken` throws a plain `Error` on a missing header — no new error-class hierarchy (matches every other `extract*` function in `src/utils/events.ts`).
- Score threshold is a hardcoded constant (`0.7`), not env-configurable (per approved spec).
- Full spec: `docs/superpowers/specs/2026-07-01-recaptcha-gate-design.md`.

---

### Task 1: reCAPTCHA scoring service

**Files:**
- Create: `src/services/recaptcha.ts`
- Modify: `src/config.ts`
- Modify: `jest.setup-test-env.js`
- Modify: `__tests__/unit/__mocks__.ts`
- Test: `__tests__/unit/services/recaptcha.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `getCaptchaScore(token: string): Promise<number>` and `recaptchaMinScore = 0.7`, both exported from `@services/recaptcha`, for Task 3 and Task 4 to import. `recaptchaSecretKey` exported from `@config`, consumed internally by `recaptcha.ts`.

- [ ] **Step 1: Add the `recaptchaToken` test constant**

  In `__tests__/unit/__mocks__.ts`, add a new section (after the `// Validation` section at the end of the file):

  ```ts
  // reCAPTCHA

  export const recaptchaToken = 'ytrewsdfghjmnbgtyu'
  ```

- [ ] **Step 2: Add `RECAPTCHA_SECRET_KEY` to the test environment**

  In `jest.setup-test-env.js`, add a new section at the end of the file:

  ```js
  // reCAPTCHA

  process.env.RECAPTCHA_SECRET_KEY = 'recaptcha-secret-key'
  ```

- [ ] **Step 3: Add `recaptchaSecretKey` to config**

  In `src/config.ts`, add a new section at the end of the file:

  ```ts
  // reCAPTCHA

  export const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY as string
  ```

- [ ] **Step 4: Write the failing test**

  Create `__tests__/unit/services/recaptcha.test.ts`:

  ```ts
  import { recaptchaToken } from '../__mocks__'
  import { recaptchaSecretKey } from '@config'
  import { getCaptchaScore } from '@services/recaptcha'
  import { logWarn } from '@utils/logging'

  const mockPost = jest.fn()
  jest.mock('axios', () => ({
    create: jest.fn().mockImplementation(() => ({ post: (...args) => mockPost(...args) })),
  }))
  jest.mock('axios-retry')
  jest.mock('@utils/logging')

  describe('recaptcha', () => {
    beforeAll(() => {
      mockPost.mockResolvedValue({ data: { success: true, score: 0.9 } })
    })

    describe('getCaptchaScore', () => {
      it('should pass token and secret to request', async () => {
        await getCaptchaScore(recaptchaToken)
        expect(mockPost).toHaveBeenCalledWith(
          'recaptcha/api/siteverify',
          {},
          {
            params: {
              response: recaptchaToken,
              secret: recaptchaSecretKey,
            },
          },
        )
      })

      it('should return score', async () => {
        const score = await getCaptchaScore(recaptchaToken)
        expect(score).toEqual(0.9)
      })

      it('should return 0 and warn when response is missing score', async () => {
        mockPost.mockResolvedValueOnce({ data: { success: true } })
        const score = await getCaptchaScore(recaptchaToken)
        expect(score).toEqual(0)
        expect(logWarn).toHaveBeenCalledWith('reCAPTCHA response missing score', { data: { success: true } })
      })

      it('should return 0 and warn when score is not a number', async () => {
        mockPost.mockResolvedValueOnce({ data: { success: true, score: undefined } })
        const score = await getCaptchaScore(recaptchaToken)
        expect(score).toEqual(0)
        expect(logWarn).toHaveBeenCalledWith('reCAPTCHA response missing score', {
          data: { success: true, score: undefined },
        })
      })

      it('should return 0 and warn when verification fails with error codes', async () => {
        mockPost.mockResolvedValueOnce({ data: { success: false, 'error-codes': ['timeout-or-duplicate'] } })
        const score = await getCaptchaScore(recaptchaToken)
        expect(score).toEqual(0)
        expect(logWarn).toHaveBeenCalledWith('reCAPTCHA verification failed', {
          success: false,
          errorCodes: ['timeout-or-duplicate'],
        })
      })

      it('should return 0 and warn when verification fails without error codes', async () => {
        mockPost.mockResolvedValueOnce({ data: { success: false } })
        const score = await getCaptchaScore(recaptchaToken)
        expect(score).toEqual(0)
        expect(logWarn).toHaveBeenCalledWith('reCAPTCHA verification failed', {
          success: false,
          errorCodes: [],
        })
      })
    })
  })
  ```

- [ ] **Step 5: Run test to verify it fails**

  Run: `npx jest __tests__/unit/services/recaptcha.test.ts`
  Expected: FAIL — `Cannot find module '@services/recaptcha'`

- [ ] **Step 6: Write the implementation**

  Create `src/services/recaptcha.ts`:

  ```ts
  import axios from 'axios'

  import { recaptchaSecretKey } from '../config'
  import { logWarn } from '../utils/logging'

  const google = axios.create({
    baseURL: 'https://www.google.com/',
  })

  interface RecaptchaResponse {
    success: boolean
    score?: number
    action?: string
    challenge_ts?: string
    hostname?: string
    'error-codes'?: string[]
  }

  export const recaptchaMinScore = 0.7

  export const getCaptchaScore = async (token: string): Promise<number> => {
    const response = await google.post<RecaptchaResponse>(
      'recaptcha/api/siteverify',
      {},
      {
        params: {
          response: token,
          secret: recaptchaSecretKey,
        },
      },
    )
    const { success, score } = response.data
    if (!success) {
      const errorCodes = response.data['error-codes'] ?? []
      logWarn('reCAPTCHA verification failed', { success, errorCodes })
      return 0
    }
    if (typeof score !== 'number') {
      logWarn('reCAPTCHA response missing score', { data: response.data })
      return 0
    }
    return score
  }
  ```

- [ ] **Step 7: Run test to verify it passes**

  Run: `npx jest __tests__/unit/services/recaptcha.test.ts`
  Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

  ```bash
  git add src/services/recaptcha.ts src/config.ts jest.setup-test-env.js __tests__/unit/__mocks__.ts __tests__/unit/services/recaptcha.test.ts
  git commit -m "Add reCAPTCHA scoring service"
  ```

---

### Task 2: `extractRecaptchaToken` header extraction

**Files:**
- Modify: `src/utils/events.ts`
- Test: `__tests__/unit/utils/events.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `extractRecaptchaToken(event: APIGatewayProxyEventV2): string`, exported from `@utils/events`, consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing test**

  In `__tests__/unit/utils/events.test.ts`, add `extractRecaptchaToken` to the import from `@utils/events`:

  ```ts
  import {
    extractClaimFromEvent,
    extractConfidenceChangeRequest,
    extractLlmRequestFromEvent,
    extractRecaptchaToken,
    extractSessionFromEvent,
    extractSuggestClaimsRequestFromEvent,
  } from '@utils/events'
  ```

  Then add a new `describe` block (alongside the existing `describe('extractClaimFromEvent', ...)` block, using the same `validateEventJson` fixture which already carries a `headers` object):

  ```ts
  describe('extractRecaptchaToken', () => {
    const event = validateEventJson as unknown as APIGatewayProxyEventV2

    it('should extract the token from the x-recaptcha-token header', () => {
      const eventWithToken = {
        ...event,
        headers: { ...event.headers, 'x-recaptcha-token': 'ytrewsdfghjmnbgtyu' },
      }

      const result = extractRecaptchaToken(eventWithToken)

      expect(result).toEqual('ytrewsdfghjmnbgtyu')
    })

    it('should error when the header is missing', () => {
      const eventWithoutToken = { ...event, headers: { ...event.headers } }
      delete eventWithoutToken.headers['x-recaptcha-token']

      expect(() => extractRecaptchaToken(eventWithoutToken)).toThrow('x-recaptcha-token header is required')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest __tests__/unit/utils/events.test.ts -t extractRecaptchaToken`
  Expected: FAIL — `extractRecaptchaToken is not a function`

- [ ] **Step 3: Write the implementation**

  In `src/utils/events.ts`, add this new section right before the final `// Events` section (i.e., directly above `const parseEventBody = ...`):

  ```ts
  // reCAPTCHA

  export const extractRecaptchaToken = (event: APIGatewayProxyEventV2): string => {
    const token = event.headers['x-recaptcha-token']
    if (!token) {
      throw new Error('x-recaptcha-token header is required')
    }
    return token
  }

  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest __tests__/unit/utils/events.test.ts -t extractRecaptchaToken`
  Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/events.ts __tests__/unit/utils/events.test.ts
  git commit -m "Add extractRecaptchaToken header extraction"
  ```

---

### Task 3: Gate `post-suggest-claims` behind reCAPTCHA

**Files:**
- Modify: `src/handlers/post-suggest-claims.ts`
- Test: `__tests__/unit/handlers/post-suggest-claims.test.ts`

**Interfaces:**
- Consumes: `getCaptchaScore`, `recaptchaMinScore` from `@services/recaptcha` (Task 1); `extractRecaptchaToken` from `@utils/events` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

  Replace the full contents of `__tests__/unit/handlers/post-suggest-claims.test.ts` with:

  ```ts
  import { invokeModelSuggestClaims } from '../__mocks__'
  import eventJson from '@events/post-suggest-claims.json'
  import { postSuggestClaimsHandler } from '@handlers/post-suggest-claims'
  import * as recaptcha from '@services/recaptcha'
  import * as suggestClaimsService from '@services/suggest-claims'
  import { APIGatewayProxyEventV2 } from '@types'
  import * as events from '@utils/events'
  import status from '@utils/status'

  jest.mock('@services/recaptcha')
  jest.mock('@services/suggest-claims')
  jest.mock('@utils/events')
  jest.mock('@utils/logging')

  describe('post-suggest-claims', () => {
    const event = eventJson as unknown as APIGatewayProxyEventV2

    beforeAll(() => {
      jest.mocked(events).extractRecaptchaToken.mockReturnValue('ytrewsdfghjmnbgtyu')
      jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockReturnValue({ language: 'en-US' })
      jest.mocked(recaptcha).getCaptchaScore.mockResolvedValue(0.9)
      jest.mocked(suggestClaimsService).getCachedOrGenerateClaims.mockResolvedValue(invokeModelSuggestClaims)
    })

    describe('postSuggestClaimsHandler', () => {
      it('returns claims', async () => {
        const result: any = await postSuggestClaimsHandler(event)

        expect(result).toEqual(expect.objectContaining(status.OK))
        expect(JSON.parse(result.body)).toEqual({ claims: invokeModelSuggestClaims })
      })

      it('calls getCaptchaScore with the extracted token', async () => {
        await postSuggestClaimsHandler(event)

        expect(recaptcha.getCaptchaScore).toHaveBeenCalledWith('ytrewsdfghjmnbgtyu')
      })

      it('calls getCachedOrGenerateClaims with the correct language', async () => {
        await postSuggestClaimsHandler(event)

        expect(suggestClaimsService.getCachedOrGenerateClaims).toHaveBeenCalledWith('en-US')
      })

      it('returns BAD_REQUEST when extractRecaptchaToken throws', async () => {
        jest.mocked(events).extractRecaptchaToken.mockImplementationOnce(() => {
          throw new Error('x-recaptcha-token header is required')
        })
        const result = await postSuggestClaimsHandler(event)

        expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
      })

      it('returns BAD_REQUEST when extractSuggestClaimsRequestFromEvent throws', async () => {
        jest.mocked(events).extractSuggestClaimsRequestFromEvent.mockImplementationOnce(() => {
          throw new Error('Bad request')
        })
        const result = await postSuggestClaimsHandler(event)

        expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
      })

      it('returns FORBIDDEN when the reCAPTCHA score is too low', async () => {
        jest.mocked(recaptcha).getCaptchaScore.mockResolvedValueOnce(0.1)
        const result = await postSuggestClaimsHandler(event)

        expect(result).toEqual(expect.objectContaining(status.FORBIDDEN))
        expect(suggestClaimsService.getCachedOrGenerateClaims).not.toHaveBeenCalled()
      })

      it('returns INTERNAL_SERVER_ERROR when getCachedOrGenerateClaims rejects', async () => {
        jest.mocked(suggestClaimsService).getCachedOrGenerateClaims.mockRejectedValueOnce(new Error('Rejected'))
        const result = await postSuggestClaimsHandler(event)

        expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
      })
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest __tests__/unit/handlers/post-suggest-claims.test.ts`
  Expected: FAIL — `Cannot find module '@services/recaptcha'` is already resolved by Task 1, so failures instead show `extractRecaptchaToken` not called / `status.FORBIDDEN` test failing (handler doesn't check score yet).

- [ ] **Step 3: Write the implementation**

  Replace the full contents of `src/handlers/post-suggest-claims.ts` with:

  ```ts
  import { getCachedOrGenerateClaims } from '../services/suggest-claims'
  import { getCaptchaScore, recaptchaMinScore } from '../services/recaptcha'
  import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from '../types'
  import { extractRecaptchaToken, extractSuggestClaimsRequestFromEvent } from '../utils/events'
  import { log, logError } from '../utils/logging'
  import status from '../utils/status'

  export const postSuggestClaimsHandler = async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2<unknown>> => {
    log('Received event', { ...event, body: undefined })
    try {
      const recaptchaToken = extractRecaptchaToken(event)
      const suggestClaimsRequest = extractSuggestClaimsRequestFromEvent(event)
      try {
        const score = await getCaptchaScore(recaptchaToken)
        log('reCAPTCHA result', { score })
        if (score < recaptchaMinScore) {
          return status.FORBIDDEN
        }

        const claims = await getCachedOrGenerateClaims(suggestClaimsRequest.language)
        log('Returning claims', { claims })
        return { ...status.OK, body: JSON.stringify({ claims }) }
      } catch (error: unknown) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest __tests__/unit/handlers/post-suggest-claims.test.ts`
  Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add src/handlers/post-suggest-claims.ts __tests__/unit/handlers/post-suggest-claims.test.ts
  git commit -m "Gate post-suggest-claims behind reCAPTCHA score check"
  ```

---

### Task 4: Gate `post-validate-claim` behind reCAPTCHA

**Files:**
- Modify: `src/handlers/post-validate-claim.ts`
- Test: `__tests__/unit/handlers/post-validate-claim.test.ts`

**Interfaces:**
- Consumes: `getCaptchaScore`, `recaptchaMinScore` from `@services/recaptcha` (Task 1); `extractRecaptchaToken` from `@utils/events` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

  Replace the full contents of `__tests__/unit/handlers/post-validate-claim.test.ts` with:

  ```ts
  import { prompt, validationResult } from '../__mocks__'
  import eventJson from '@events/post-validate-claim.json'
  import { postValidateClaimHandler } from '@handlers/post-validate-claim'
  import * as bedrock from '@services/bedrock'
  import * as dynamodb from '@services/dynamodb'
  import * as recaptcha from '@services/recaptcha'
  import { APIGatewayProxyEventV2 } from '@types'
  import * as events from '@utils/events'
  import status from '@utils/status'

  jest.mock('@services/bedrock')
  jest.mock('@services/dynamodb')
  jest.mock('@services/recaptcha')
  jest.mock('@utils/events')
  jest.mock('@utils/logging')

  describe('post-validate-claim', () => {
    const event = eventJson as unknown as APIGatewayProxyEventV2

    const claim = 'Brisket is the best meat'

    beforeAll(() => {
      jest.mocked(bedrock).invokeModel.mockResolvedValue(validationResult)
      jest.mocked(dynamodb).getPromptById.mockResolvedValue(prompt)
      jest.mocked(events).extractClaimFromEvent.mockReturnValue({ claim, language: 'en-US' })
      jest.mocked(events).extractRecaptchaToken.mockReturnValue('ytrewsdfghjmnbgtyu')
      jest.mocked(recaptcha).getCaptchaScore.mockResolvedValue(0.9)
    })

    describe('postValidateClaimHandler', () => {
      it('returns claims validation information', async () => {
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.OK))
        expect(JSON.parse(result.body)).toEqual(validationResult)
      })

      it('calls getCaptchaScore with the extracted token', async () => {
        await postValidateClaimHandler(event)

        expect(recaptcha.getCaptchaScore).toHaveBeenCalledWith('ytrewsdfghjmnbgtyu')
      })

      it('returns BAD_REQUEST when extractRecaptchaToken throws', async () => {
        jest.mocked(events).extractRecaptchaToken.mockImplementationOnce(() => {
          throw new Error('x-recaptcha-token header is required')
        })
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
      })

      it('returns BAD_REQUEST when extractClaimFromEvent throws an error', async () => {
        jest.mocked(events).extractClaimFromEvent.mockImplementationOnce(() => {
          throw new Error('Bad request')
        })
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.BAD_REQUEST))
      })

      it('returns FORBIDDEN when the reCAPTCHA score is too low', async () => {
        jest.mocked(recaptcha).getCaptchaScore.mockResolvedValueOnce(0.1)
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.FORBIDDEN))
        expect(dynamodb.getPromptById).not.toHaveBeenCalled()
      })

      it('returns INTERNAL_SERVER_ERROR when getPromptById rejects', async () => {
        jest.mocked(dynamodb).getPromptById.mockRejectedValueOnce(new Error('Rejected'))
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
      })

      it('returns INTERNAL_SERVER_ERROR when invokeModel rejects', async () => {
        jest.mocked(bedrock).invokeModel.mockRejectedValueOnce(new Error('Rejected'))
        const result = await postValidateClaimHandler(event)

        expect(result).toEqual(expect.objectContaining(status.INTERNAL_SERVER_ERROR))
      })
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest __tests__/unit/handlers/post-validate-claim.test.ts`
  Expected: FAIL — the `FORBIDDEN` and `getCaptchaScore`-called tests fail because the handler doesn't check score yet.

- [ ] **Step 3: Write the implementation**

  Replace the full contents of `src/handlers/post-validate-claim.ts` with:

  ```ts
  import { validateClaimPromptId } from '../config'
  import { invokeModel } from '../services/bedrock'
  import { getPromptById } from '../services/dynamodb'
  import { getCaptchaScore, recaptchaMinScore } from '../services/recaptcha'
  import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, ValidationResponse } from '../types'
  import { extractClaimFromEvent, extractRecaptchaToken } from '../utils/events'
  import { log, logError } from '../utils/logging'
  import status from '../utils/status'

  export const postValidateClaimHandler = async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2<unknown>> => {
    log('Received event', { ...event, body: undefined })
    try {
      const recaptchaToken = extractRecaptchaToken(event)
      const { claim, language } = extractClaimFromEvent(event)
      try {
        const score = await getCaptchaScore(recaptchaToken)
        log('reCAPTCHA result', { score })
        if (score < recaptchaMinScore) {
          return status.FORBIDDEN
        }

        const prompt = await getPromptById(validateClaimPromptId)
        const validation = await invokeModel<ValidationResponse>(prompt, claim, { language })
        log('Claim validation complete', { claim, validation })

        return { ...status.OK, body: JSON.stringify(validation) }
      } catch (error: unknown) {
        logError(error)
        return status.INTERNAL_SERVER_ERROR
      }
    } catch (error: unknown) {
      return { ...status.BAD_REQUEST, body: JSON.stringify({ message: (error as Error).message }) }
    }
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest __tests__/unit/handlers/post-validate-claim.test.ts`
  Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

  ```bash
  git add src/handlers/post-validate-claim.ts __tests__/unit/handlers/post-validate-claim.test.ts
  git commit -m "Gate post-validate-claim behind reCAPTCHA score check"
  ```

---

### Task 5: Deployment plumbing (SAM template, pipeline, CORS, example requests)

**Files:**
- Modify: `template.yaml`
- Modify: `.github/workflows/pipeline.yaml`
- Modify: `endpoints.rest`

**Interfaces:**
- Consumes: nothing (infra-only; no TypeScript imports).
- Produces: `RECAPTCHA_SECRET_KEY` env var available to both Lambda functions at runtime, which Task 1's `recaptchaSecretKey` config export reads.

- [ ] **Step 1: Add the `RecaptchaSecretKey` parameter**

  In `template.yaml`, in the `Parameters:` block, add after `SuggestClaimsUrl`:

  ```yaml
    RecaptchaSecretKey:
      Type: String
      Description: Secret key for reCAPTCHA v3
      NoEcho: true
  ```

- [ ] **Step 2: Allow the `X-Recaptcha-Token` header in CORS**

  In `template.yaml`, in `HttpApi.Properties.CorsConfiguration.AllowHeaders`, add `X-Recaptcha-Token` after `X-Twitch-Token`:

  ```yaml
        AllowHeaders:
          - Authorization
          - Content-Type
          - X-Amz-Date
          - X-Amz-Security-Token
          - X-Api-Key
          - X-Recaptcha-Token
          - X-Twitch-Token
  ```

- [ ] **Step 3: Wire the secret into `PostSuggestClaimsFunction`**

  In `template.yaml`, in `PostSuggestClaimsFunction.Properties.Environment.Variables`, add `RECAPTCHA_SECRET_KEY`:

  ```yaml
        Variables:
          DYNAMODB_PROMPT_TABLE_NAME: !Ref PromptTable
          DYNAMODB_SUGGEST_CLAIMS_TABLE_NAME: !Ref SuggestClaimsTable
          RECAPTCHA_SECRET_KEY: !Ref RecaptchaSecretKey
          SUGGEST_CLAIMS_CACHE_HOURS: 4
          SUGGEST_CLAIMS_COUNT: 20
          SUGGEST_CLAIMS_GENERATION_STALE_SECONDS: 180
          SUGGEST_CLAIMS_POLL_DEADLINE_SECONDS: 30
          SUGGEST_CLAIMS_PROMPT_ID: suggest-claims
          SUGGEST_CLAIMS_URL: !Ref SuggestClaimsUrl
  ```

- [ ] **Step 4: Wire the secret into `PostValidateClaimFunction`**

  In `template.yaml`, in `PostValidateClaimFunction.Properties.Environment.Variables`, add `RECAPTCHA_SECRET_KEY`:

  ```yaml
        Variables:
          DYNAMODB_PROMPT_TABLE_NAME: !Ref PromptTable
          RECAPTCHA_SECRET_KEY: !Ref RecaptchaSecretKey
          VALIDATE_CLAIM_PROMPT_ID: validate-claim
  ```

- [ ] **Step 5: Validate the template**

  Run: `sam validate --template template.yaml`
  Expected: `template.yaml is a valid SAM Template` (requires AWS SAM CLI; if unavailable, run `npx js-yaml template.yaml > /dev/null` instead to confirm valid YAML syntax)

- [ ] **Step 6: Add the pipeline secret and parameter overrides**

  In `.github/workflows/pipeline.yaml`, add to the top-level `env:` block (alphabetically, after `PROD_STACK_NAME` and before `SAM_TEMPLATE`):

  ```yaml
    RECAPTCHA_SECRET_KEY: ${{ secrets.RECAPTCHA_SECRET_KEY }}
  ```

  Then update all three `--parameter-overrides` strings to append `RecaptchaSecretKey=${RECAPTCHA_SECRET_KEY}`:

  In the `build-and-deploy-testing` job:

  ```yaml
            --parameter-overrides "Environment=test RecaptchaSecretKey=${RECAPTCHA_SECRET_KEY} SuggestClaimsUrl=${SUGGEST_CLAIMS_URL}"
  ```

  In the `deploy-testing` job:

  ```yaml
            --parameter-overrides "Environment=test RecaptchaSecretKey=${RECAPTCHA_SECRET_KEY} SuggestClaimsUrl=${SUGGEST_CLAIMS_URL}"
  ```

  In the `deploy-prod` job:

  ```yaml
            --parameter-overrides "RecaptchaSecretKey=${RECAPTCHA_SECRET_KEY} SuggestClaimsUrl=${SUGGEST_CLAIMS_URL}"
  ```

- [ ] **Step 7: Add the header to example requests**

  In `endpoints.rest`, update the two request blocks:

  ```
  ### Suggest claims

  POST https://{{sse-api-host}}/v1/suggest-claims HTTP/1.1
  content-type: application/json
  x-recaptcha-token: {{recaptcha-token}}

  {}

  ### Validate a claim

  POST https://{{sse-api-host}}/v1/validate-claim HTTP/1.1
  content-type: application/json
  x-recaptcha-token: {{recaptcha-token}}

  {
    "claim": "Some citizens who can currently vote should not be able to."
  }
  ```

- [ ] **Step 8: Run the full test suite and typecheck**

  Run: `npm run test && npm run typecheck`
  Expected: All tests pass, no type errors.

- [ ] **Step 9: Commit**

  ```bash
  git add template.yaml .github/workflows/pipeline.yaml endpoints.rest
  git commit -m "Wire reCAPTCHA secret through SAM template and deploy pipeline"
  ```

---

## Post-Implementation Note

The `RECAPTCHA_SECRET_KEY` GitHub Actions secret must be added to the `sse-api` repo (using a newly registered reCAPTCHA v3 site scoped to the sse domain) before the `deploy-testing`/`deploy-prod` pipeline jobs will succeed. This is a manual, external step owned by the repo owner — it does not block merging this branch, only the subsequent deploy.
