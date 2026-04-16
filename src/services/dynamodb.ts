import {
  DeleteItemCommand,
  DynamoDB,
  GetItemCommand,
  PutItemCommand,
  PutItemOutput,
  QueryCommand,
} from '@aws-sdk/client-dynamodb'

import { dynamodbPromptTableName, dynamodbSessionTableName, dynamodbSuggestClaimsTableName } from '../config'
import { Prompt, PromptId, Session, SessionId, SuggestClaimsRecord } from '../types'
import { xrayCapture } from '../utils/logging'

const dynamodb = xrayCapture(new DynamoDB({ apiVersion: '2012-08-10' }))

// Prompts

export const getPromptById = async (promptId: PromptId): Promise<Prompt> => {
  const command = new QueryCommand({
    ExpressionAttributeValues: { ':promptId': { S: `${promptId}` } },
    KeyConditionExpression: 'PromptId = :promptId',
    Limit: 1,
    ScanIndexForward: false,
    TableName: dynamodbPromptTableName,
  })
  const response = await dynamodb.send(command)
  return {
    config: JSON.parse(response.Items?.[0]?.Config?.S as string),
    contents: response.Items?.[0]?.SystemPrompt?.S as string,
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
  return await dynamodb.send(command)
}

// Suggest Claims

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60

const getEpochSeconds = (): number => Math.floor(Date.now() / 1000)

export const getLatestSuggestClaims = async (dateKey: string): Promise<SuggestClaimsRecord | undefined> => {
  const command = new QueryCommand({
    ExpressionAttributeValues: { ':dateKey': { S: dateKey } },
    KeyConditionExpression: 'DateKey = :dateKey',
    Limit: 1,
    ScanIndexForward: false,
    TableName: dynamodbSuggestClaimsTableName,
  })
  const response = await dynamodb.send(command)
  const item = response.Items?.[0]
  if (!item) return undefined
  return {
    claims: item.Data?.S ? JSON.parse(item.Data.S) : undefined,
    createdAt: parseInt(item.CreatedAt.N as string, 10),
    generating: item.Generating?.BOOL ?? false,
    language: item.Language.S as string,
  }
}

export const setGeneratingSuggestClaims = async (dateKey: string, language: string): Promise<number> => {
  const now = getEpochSeconds()
  const command = new PutItemCommand({
    Item: {
      CreatedAt: { N: `${now}` },
      DateKey: { S: dateKey },
      Expiration: { N: `${now + THIRTY_DAYS_IN_SECONDS}` },
      Generating: { BOOL: true },
      Language: { S: language },
    },
    TableName: dynamodbSuggestClaimsTableName,
  })
  await dynamodb.send(command)
  return now
}

export const setSuggestClaims = async (
  dateKey: string,
  createdAt: number,
  claims: string[],
  language: string,
): Promise<PutItemOutput> => {
  const command = new PutItemCommand({
    Item: {
      CreatedAt: { N: `${createdAt}` },
      Data: { S: JSON.stringify(claims) },
      DateKey: { S: dateKey },
      Expiration: { N: `${createdAt + THIRTY_DAYS_IN_SECONDS}` },
      Generating: { BOOL: false },
      Language: { S: language },
    },
    TableName: dynamodbSuggestClaimsTableName,
  })
  return await dynamodb.send(command)
}

export const deleteGeneratingSuggestClaims = async (dateKey: string, createdAt: number): Promise<void> => {
  const command = new DeleteItemCommand({
    Key: {
      CreatedAt: { N: `${createdAt}` },
      DateKey: { S: dateKey },
    },
    TableName: dynamodbSuggestClaimsTableName,
  })
  await dynamodb.send(command)
}
