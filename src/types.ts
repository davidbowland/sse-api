export * from 'aws-lambda'
export { Operation as PatchOperation } from 'fast-json-patch'

// Chatting

export type ConfidenceLevel =
  | 'absolutely disagree'
  | 'strongly disagree'
  | 'disagree'
  | 'slightly disagree'
  | 'neutral'
  | 'slightly agree'
  | 'agree'
  | 'strongly agree'
  | 'absolutely agree'

export interface ChatMessage {
  content: string
  role: 'assistant' | 'user'
}

// Prompts

export type PromptId = string

export interface PromptConfig {
  anthropicVersion: string
  maxTokens: number
  model: string
  temperature: number
  topK: number
}

export interface Prompt {
  config: PromptConfig
  contents: string
}

// Sessions

export type SessionId = string

export interface Session {
  claim: string
  confidence: ConfidenceLevel
  expiration: number
  history: ChatMessage[]
  reasons: string[]
}
