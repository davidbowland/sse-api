import { InvokeCommand } from '@aws-sdk/client-lambda'

import { invokeLambda } from '@services/lambda'

const mockSend = jest.fn()
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockSend(...args),
  })),
  InvokeCommand: jest.fn().mockImplementation((x) => x),
}))
jest.mock('@utils/logging', () => ({
  log: jest.fn(),
}))

describe('lambda', () => {
  describe('invokeLambda', () => {
    const functionArn = 'arn:aws:lambda:us-east-1:123456789:function:my-worker'
    const payload = { sessionId: 'abc', promptId: 'probe-confidence', userMessage: { content: 'hello', role: 'user' } }

    beforeEach(() => {
      mockSend.mockResolvedValue({})
    })

    it('calls InvokeCommand with correct FunctionName, InvocationType Event, and serialized payload', async () => {
      await invokeLambda(functionArn, payload)

      expect(InvokeCommand).toHaveBeenCalledWith({
        FunctionName: functionArn,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify(payload)),
      })
      expect(mockSend).toHaveBeenCalledTimes(1)
    })

    it('sends the command via the LambdaClient', async () => {
      await invokeLambda(functionArn, payload)

      expect(mockSend).toHaveBeenCalledWith({
        FunctionName: functionArn,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify(payload)),
      })
    })
  })
})
