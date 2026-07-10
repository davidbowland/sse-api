#!/usr/bin/env ts-node
import { DynamoDB, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

const dynamodb = new DynamoDB({ apiVersion: '2012-08-10', region: 'us-east-1' })

interface PromptData {
  promptId: string
  config: string
  systemPrompt: string
  updatedAt: number
}

interface ExistingPrompt {
  config: string
  systemPrompt: string
}

// Models that only accept adaptive thinking + output_config.effort (manual budget_tokens returns a 400)
const ADAPTIVE_ONLY_MODEL_PATTERNS = [
  /claude-sonnet-5$/,
  /claude-sonnet-4-6/,
  /claude-opus-4-6/,
  /claude-opus-4-7/,
  /claude-opus-4-8/,
  /claude-fable-5/,
  /claude-mythos/,
]

// Models that only accept manual thinking.enabled + budget_tokens (adaptive/effort isn't supported)
const MANUAL_THINKING_ONLY_MODEL_PATTERNS = [
  /claude-haiku-4-5/,
  /claude-opus-4-5/,
  /claude-sonnet-4-5/,
  /claude-sonnet-4-20250514/,
  /claude-opus-4-20250514/,
  /claude-3-7-sonnet/,
]

const validateThinkingConfig = (filename: string, config: Record<string, unknown>): void => {
  const model = (config.model as string) ?? ''
  const thinkingType = (config.thinking as { type?: string } | undefined)?.type

  if (ADAPTIVE_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(model)) && thinkingType === 'enabled') {
    throw new Error(
      `${filename}: model "${model}" does not support manual thinking with budgetTokens — ` +
        'use {"type":"adaptive","effort":...}',
    )
  }
  if (MANUAL_THINKING_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(model)) && thinkingType === 'adaptive') {
    throw new Error(
      `${filename}: model "${model}" does not support adaptive thinking/effort — ` +
        'use {"type":"enabled","budgetTokens":...}',
    )
  }
}

const parsePromptFile = (filename: string, content: string, now: number): PromptData => {
  const promptId = filename.split('.', 1)[0]
  const { config, systemPrompt } =
    /^[\s#]*(?<config>[^\n]+)\s*\n\s+(?<systemPrompt>.*?)\s+$/s.exec(content)?.groups ?? {}

  let parsedConfig: Record<string, unknown>
  try {
    parsedConfig = JSON.parse(config)
  } catch {
    throw new Error(`Invalid JSON in prompt config: ${filename}`)
  }
  validateThinkingConfig(filename, parsedConfig)

  return {
    promptId,
    config,
    systemPrompt,
    updatedAt: now,
  }
}

const getExistingPrompt = async (tableName: string, promptId: string): Promise<ExistingPrompt | null> => {
  const command = new QueryCommand({
    ExpressionAttributeValues: { ':promptId': { S: promptId } },
    KeyConditionExpression: 'PromptId = :promptId',
    Limit: 1,
    ScanIndexForward: false,
    TableName: tableName,
  })

  try {
    const response = await dynamodb.send(command)
    if (!response.Items || response.Items.length === 0) {
      return null
    }

    return {
      config: response.Items[0].Config?.S as string,
      systemPrompt: response.Items[0].SystemPrompt?.S as string,
    }
  } catch (error: unknown) {
    return null
  }
}

const deployPrompt = async (tableName: string, promptData: PromptData): Promise<void> => {
  const command = new PutItemCommand({
    Item: {
      PromptId: {
        S: promptData.promptId,
      },
      UpdatedAt: {
        N: `${promptData.updatedAt}`,
      },
      Config: {
        S: promptData.config,
      },
      SystemPrompt: {
        S: promptData.systemPrompt,
      },
    },
    TableName: tableName,
  })

  await dynamodb.send(command)
  console.log('Deployed prompt', { promptId: promptData.promptId, tableName })
}

const deployPrompts = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const tableName = args[0] || 'sse-api-prompts-test'
  const now = Date.now()

  try {
    const promptsDir = join(__dirname, '../prompts')
    const files = await readdir(promptsDir)

    if (files.length === 0) {
      console.warn('No prompt files found', { promptsDir })
      return
    }

    console.log('Found prompt files', { count: files.length, files: files })
    for (const file of files) {
      const filePath = join(promptsDir, file)
      const content = await readFile(filePath, 'utf-8')
      const promptData = parsePromptFile(file, content, now)

      const existingPrompt = await getExistingPrompt(tableName, promptData.promptId)

      if (existingPrompt?.systemPrompt === promptData.systemPrompt && existingPrompt?.config === promptData.config) {
        console.log('Skipping unchanged prompt', { promptId: promptData.promptId })
      } else {
        await deployPrompt(tableName, promptData)
      }
    }

    console.log('Deployment complete', { total: files.length, tableName })
  } catch (error: unknown) {
    console.error('Failed to deploy prompts', error)
    process.exit(1)
  }
}

if (require.main === module) {
  deployPrompts()
}

export { deployPrompts }
