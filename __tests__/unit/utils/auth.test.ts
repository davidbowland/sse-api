import { APIGatewayProxyEventV2 } from '@types'
import { extractAuthContext, extractAuthFromToken } from '@utils/auth'

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'mock-jwks'),
  jwtVerify: jest.fn(),
}))

describe('extractAuthContext', () => {
  const baseEvent = {
    requestContext: {
      http: { method: 'POST', path: '/v1/test' },
    },
  } as unknown as APIGatewayProxyEventV2

  it('should return unauthenticated when no authorizer is present', () => {
    const result = extractAuthContext(baseEvent)
    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: false })
  })

  it('should return unauthenticated when authorizer has no jwt', () => {
    const event = {
      ...baseEvent,
      requestContext: { ...baseEvent.requestContext, authorizer: {} },
    } as unknown as APIGatewayProxyEventV2
    const result = extractAuthContext(event)
    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: false })
  })

  it('should return authenticated with sub and name from claims', () => {
    const event = {
      ...baseEvent,
      requestContext: {
        ...baseEvent.requestContext,
        authorizer: {
          jwt: {
            claims: { sub: 'abc123', name: 'Alice' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2
    const result = extractAuthContext(event)
    expect(result).toEqual({
      isAuthenticated: true,
      googleSub: 'abc123',
      googleName: 'Alice',
      tokenPresent: true,
    })
  })

  it('should return authenticated with null sub when sub is missing', () => {
    const event = {
      ...baseEvent,
      requestContext: {
        ...baseEvent.requestContext,
        authorizer: {
          jwt: {
            claims: { name: 'Bob' },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2
    const result = extractAuthContext(event)
    expect(result).toEqual({
      isAuthenticated: true,
      googleSub: null,
      googleName: 'Bob',
      tokenPresent: true,
    })
  })

  it('should ignore non-string claim values', () => {
    const event = {
      ...baseEvent,
      requestContext: {
        ...baseEvent.requestContext,
        authorizer: {
          jwt: {
            claims: { name: 123, sub: true },
          },
        },
      },
    } as unknown as APIGatewayProxyEventV2
    const result = extractAuthContext(event)
    expect(result).toEqual({
      isAuthenticated: true,
      googleSub: null,
      tokenPresent: true,
    })
  })
})

describe('extractAuthFromToken', () => {
  const { jwtVerify } = jest.requireMock('jose')

  const baseEvent = {
    headers: {},
    requestContext: { http: { method: 'POST', path: '/v1/test' } },
  } as unknown as APIGatewayProxyEventV2

  beforeEach(() => {
    jwtVerify.mockReset()
  })

  it('should return unauthenticated when no Authorization header', async () => {
    const result = await extractAuthFromToken(baseEvent)
    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: false })
  })

  it('should return unauthenticated when header is not Bearer', async () => {
    const event = { ...baseEvent, headers: { authorization: 'Basic abc123' } } as unknown as APIGatewayProxyEventV2
    const result = await extractAuthFromToken(event)
    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: false })
  })

  it('should return authenticated when token is valid', async () => {
    jwtVerify.mockResolvedValueOnce({ payload: { sub: 'user-456' } })
    const event = {
      ...baseEvent,
      headers: { authorization: 'Bearer valid-token' },
    } as unknown as APIGatewayProxyEventV2

    const result = await extractAuthFromToken(event)

    expect(result).toEqual({ isAuthenticated: true, googleSub: 'user-456', tokenPresent: true })
    expect(jwtVerify).toHaveBeenCalledWith(
      'valid-token',
      'mock-jwks',
      expect.objectContaining({ issuer: expect.any(String) }),
    )
  })

  it('should return tokenPresent but not authenticated when token is invalid', async () => {
    jwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const event = { ...baseEvent, headers: { authorization: 'Bearer bad-token' } } as unknown as APIGatewayProxyEventV2

    const result = await extractAuthFromToken(event)

    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: true })
  })

  it('should return tokenPresent but not authenticated when sub is missing', async () => {
    jwtVerify.mockResolvedValueOnce({ payload: {} })
    const event = {
      ...baseEvent,
      headers: { authorization: 'Bearer no-sub-token' },
    } as unknown as APIGatewayProxyEventV2

    const result = await extractAuthFromToken(event)

    expect(result).toEqual({ isAuthenticated: false, googleSub: null, tokenPresent: true })
  })
})
