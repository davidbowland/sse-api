import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { log } from '../utils/logging'

const lambdaClient = new LambdaClient({ region: 'us-east-1' })

export const invokeLambda = async (functionArn: string, payload: Record<string, unknown>): Promise<void> => {
  // Log only the payload's shape, not its contents -- worker payloads (e.g. llm-response-worker's
  // userMessage) carry user-submitted chat/claim text that must not land in CloudWatch.
  log('Invoking Lambda', { functionArn, payloadKeys: Object.keys(payload) })
  const command = new InvokeCommand({
    FunctionName: functionArn,
    InvocationType: 'Event',
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  })
  await lambdaClient.send(command)
}
