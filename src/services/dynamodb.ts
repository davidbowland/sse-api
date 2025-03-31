import { DynamoDB, GetItemCommand, PutItemCommand, PutItemOutput } from '@aws-sdk/client-dynamodb'

import { dynamodbPromptTableName, dynamodbSessionTableName } from '../config'
import { Prompt, PromptId, Session, SessionId } from '../types'
import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDB({ apiVersion: '2012-08-10' }))

// Prompts

export const getPromptById = async (promptId: PromptId): Promise<Prompt> => {
  const command = new GetItemCommand({
    Key: {
      PromptId: {
        S: `${promptId}`,
      },
    },
    TableName: dynamodbPromptTableName,
  })
  const response = await dynamodb.send(command)
  return {
    config: JSON.parse(response.Item.Config.S as string),
    contents: response.Item.SystemPrompt.S as string,
  }
}

// Sessions

export const getSessionById = async (sessionId: SessionId): Promise<Session> => {
  const command = new GetItemCommand({
    Key: {
      SessionId: {
        S: `${sessionId}`,
      },
    },
    TableName: dynamodbSessionTableName,
  })
  const response = await dynamodb.send(command)
  return JSON.parse(response.Item.Data.S as string)
}

export const setSessionById = async (sessionId: SessionId, session: Session): Promise<PutItemOutput> => {
  const command = new PutItemCommand({
    Item: {
      Data: {
        S: JSON.stringify(session),
      },
      Expiration: {
        N: `${session.expiration}`,
      },
      SessionId: {
        S: `${sessionId}`,
      },
    },
    TableName: dynamodbSessionTableName,
  })
  return dynamodb.send(command)
}
