import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { log } from '../utils/logging'

const lambdaClient = new LambdaClient({ region: 'us-east-1' })

export const invokeLambda = async (functionArn: string, payload: Record<string, unknown>): Promise<void> => {
  log('Invoking Lambda', { functionArn, payload })
  const command = new InvokeCommand({
    FunctionName: functionArn,
    InvocationType: 'Event',
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  })
  await lambdaClient.send(command)
}
