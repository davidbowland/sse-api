import { createRemoteJWKSet, jwtVerify } from 'jose'

import { cognitoClientId, cognitoUserPoolId } from '../config'
import { APIGatewayProxyEventV2, AuthContext } from '../types'

// For routes with API Gateway JWT Authorizer — claims are pre-verified
interface JwtClaims {
  jwt?: {
    claims?: Record<string, unknown>
  }
}

interface RequestContextWithAuthorizer {
  authorizer?: JwtClaims
}

/**
 * Reads pre-verified claims from API Gateway JWT Authorizer.
 * Use on routes where the authorizer is attached — token is already validated.
 */
export const extractAuthContext = (event: APIGatewayProxyEventV2): AuthContext => {
  const requestContext = event.requestContext as unknown as RequestContextWithAuthorizer | undefined
  const claims = requestContext?.authorizer?.jwt?.claims
  if (!claims) {
    return { isAuthenticated: false, googleSub: null, tokenPresent: false }
  }

  return {
    googleName: typeof claims.name === 'string' ? claims.name : undefined,
    googleSub: typeof claims.sub === 'string' ? claims.sub : null,
    isAuthenticated: true,
    tokenPresent: true,
  }
}

// For routes WITHOUT the authorizer — manual JWT verification for optional auth
const region = process.env.AWS_REGION ?? 'us-east-1'
const issuer = `https://cognito-idp.${region}.amazonaws.com/${cognitoUserPoolId}`
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

/**
 * Manually verifies a Cognito JWT from the Authorization header.
 * Use on routes where auth is optional (no API Gateway authorizer attached).
 * Distinguishes "no token" (anonymous) from "bad token" (reject).
 */
export const extractAuthFromToken = async (event: APIGatewayProxyEventV2): Promise<AuthContext> => {
  const authHeader = event.headers?.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { isAuthenticated: false, googleSub: null, tokenPresent: false }
  }

  const token = authHeader.slice(7)
  try {
    const { payload } = await jwtVerify(token, jwks, { audience: cognitoClientId, issuer })
    const userId = payload.sub
    if (!userId) {
      return { isAuthenticated: false, googleSub: null, tokenPresent: true }
    }
    return { googleSub: userId, isAuthenticated: true, tokenPresent: true }
  } catch {
    return { isAuthenticated: false, googleSub: null, tokenPresent: true }
  }
}
