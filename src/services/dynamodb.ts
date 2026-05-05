import {
  AttributeValue,
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDB,
  GetItemCommand,
  PutItemCommand,
  PutItemOutput,
  QueryCommand,
} from '@aws-sdk/client-dynamodb'

import { dynamodbPromptTableName, dynamodbSessionTableName, dynamodbSuggestClaimsTableName } from '../config'
import { Prompt, PromptId, Session, SessionId, SessionSummary, SuggestClaimsRecord } from '../types'
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
  const item = response.Item
  return {
    context: {
      claim: item.Claim.S as string,
      confidence: item.Confidence.S as string,
      generatedReasons: JSON.parse(item.GeneratedReasons.S as string),
      language: item.Language.S as string,
      possibleConfidenceLevels: JSON.parse(item.PossibleConfidenceLevels.S as string),
    },
    conversationSteps: JSON.parse(item.ConversationSteps.S as string),
    currentStep: item.CurrentStep?.S,
    dividers: JSON.parse(item.Dividers.S as string),
    expiration: parseInt(item.Expiration.N as string, 10),
    history: JSON.parse(item.History.S as string),
    incorrect_guesses: parseInt(item.IncorrectGuesses.N as string, 10),
    llmHistory: JSON.parse(item.LlmHistory.S as string),
    loadingTimeout: item.LoadingTimeout?.N ? parseInt(item.LoadingTimeout.N, 10) : undefined,
    newConversation: item.NewConversation.BOOL as boolean,
    originalConfidence: item.OriginalConfidence.S as string,
    overrideStep: item.OverrideStep?.S ? JSON.parse(item.OverrideStep.S) : undefined,
    question: parseInt(item.Question.N as string, 10),
    storedMessage: item.StoredMessage?.S ? JSON.parse(item.StoredMessage.S) : undefined,
    userId: item.UserId?.S,
    version: item.Version?.N ? parseInt(item.Version.N, 10) : 0,
  }
}

export class VersionConflictError extends Error {
  constructor(sessionId: string) {
    super(`Version conflict writing session ${sessionId}`)
    this.name = 'VersionConflictError'
  }
}

export const setSessionById = async (sessionId: SessionId, session: Session): Promise<PutItemOutput> => {
  const now = Math.floor(Date.now() / 1000)
  const nextVersion = session.version + 1

  const item: Record<string, AttributeValue> = {
    Claim: { S: session.context.claim },
    Confidence: { S: session.context.confidence },
    ConversationSteps: { S: JSON.stringify(session.conversationSteps) },
    Dividers: { S: JSON.stringify(session.dividers) },
    Expiration: { N: `${session.expiration}` },
    GeneratedReasons: { S: JSON.stringify(session.context.generatedReasons) },
    History: { S: JSON.stringify(session.history) },
    IncorrectGuesses: { N: `${session.incorrect_guesses}` },
    Language: { S: session.context.language },
    LlmHistory: { S: JSON.stringify(session.llmHistory) },
    NewConversation: { BOOL: session.newConversation },
    OriginalConfidence: { S: session.originalConfidence },
    PossibleConfidenceLevels: { S: JSON.stringify(session.context.possibleConfidenceLevels) },
    Question: { N: `${session.question}` },
    SessionId: { S: `${sessionId}` },
    UpdatedAt: { N: `${now}` },
    Version: { N: `${nextVersion}` },
  }

  if (session.currentStep) {
    item.CurrentStep = { S: session.currentStep }
  }
  if (session.loadingTimeout) {
    item.LoadingTimeout = { N: `${session.loadingTimeout}` }
  }
  if (session.overrideStep) {
    item.OverrideStep = { S: JSON.stringify(session.overrideStep) }
  }
  if (session.storedMessage) {
    item.StoredMessage = { S: JSON.stringify(session.storedMessage) }
  }
  if (session.userId) {
    item.UserId = { S: session.userId }
  }

  // Optimistic locking: only succeed if the stored version matches what we read
  const isNewSession = session.version === 0
  const command = new PutItemCommand({
    ConditionExpression: isNewSession ? 'attribute_not_exists(SessionId)' : 'Version = :expectedVersion',
    ExpressionAttributeValues: isNewSession ? undefined : { ':expectedVersion': { N: `${session.version}` } },
    Item: item,
    TableName: dynamodbSessionTableName,
  })

  try {
    return await dynamodb.send(command)
  } catch (error: unknown) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new VersionConflictError(sessionId)
    }
    throw error
  }
}

export const getSessionsByUserId = async (userId: string): Promise<SessionSummary[]> => {
  const command = new QueryCommand({
    ExpressionAttributeValues: { ':userId': { S: userId } },
    IndexName: 'UserId-UpdatedAt-index',
    KeyConditionExpression: 'UserId = :userId',
    ProjectionExpression: 'SessionId, Claim, Confidence, UpdatedAt',
    ScanIndexForward: false,
    TableName: dynamodbSessionTableName,
  })
  const response = await dynamodb.send(command)
  return (response.Items ?? []).map((item: Record<string, AttributeValue>) => ({
    claim: item.Claim.S as string,
    confidence: item.Confidence.S as string,
    sessionId: item.SessionId.S as string,
    updatedAt: parseInt(item.UpdatedAt.N as string, 10),
  }))
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
