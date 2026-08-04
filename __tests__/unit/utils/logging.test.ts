import { APIGatewayProxyEventV2 } from '@types'
import { extractRequestError, log, logError, redactEvent } from '@utils/logging'

describe('logging', () => {
  beforeAll(() => {
    console.error = jest.fn()
    console.log = jest.fn()
  })

  describe('extractRequestError', () => {
    it('should return JSON data as an object', async () => {
      const data = { hello: 'world' }
      const output = extractRequestError(JSON.stringify(data))

      expect(output).toEqual({ errors: data })
    })

    it('should return non-JSON data as a string', async () => {
      const data = 'fnord'
      const output = extractRequestError(data)

      expect(output).toEqual({ message: data })
    })
  })

  describe('log', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should invoke logFunc with message', async (value) => {
      const message = `Log message for value ${JSON.stringify(value)}`
      await log(message)

      expect(console.log).toHaveBeenCalledWith(message)
    })
  })

  describe('logDebug', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should invoke logFunc with message', async (value) => {
      const message = `Debug message for value ${JSON.stringify(value)}`
      await log(message)

      expect(console.log).toHaveBeenCalledWith(message)
    })
  })

  describe('logError', () => {
    it.each(['Hello', 0, null, undefined, { a: 1, b: 2 }])('should invoke logFunc with message', async (value) => {
      const message = `Error message for value ${JSON.stringify(value)}`
      const error = new Error(message)
      await logError(error)

      expect(console.error).toHaveBeenCalledWith(error)
    })
  })

  describe('redactEvent', () => {
    const event = {
      body: JSON.stringify({ claim: 'The moon is made of cheese' }),
      headers: { authorization: 'Bearer secret-token', Authorization: 'Bearer secret-token', 'content-type': 'json' },
    } as unknown as APIGatewayProxyEventV2

    it('drops the body', () => {
      expect(redactEvent(event).body).toBeUndefined()
    })

    it('drops authorization headers (any casing) but keeps other headers', () => {
      const result = redactEvent(event).headers as Record<string, string>

      expect(result.authorization).toBeUndefined()
      expect(result.Authorization).toBeUndefined()
      expect(result['content-type']).toBe('json')
    })

    it('handles events with no headers', () => {
      const noHeaders = { body: 'ignored' } as unknown as APIGatewayProxyEventV2
      const result = redactEvent(noHeaders)

      expect(result.headers).toEqual({})
    })
  })
})
