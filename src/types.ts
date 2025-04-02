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

// Claims

export interface Claim {
  claim: string
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

// LLM interactions

export interface LLMRequest {
  message: ChatMessage
  newConversation?: boolean
}

export interface LLMResponse {
  finished: boolean
  message: string
  reasons?: string[]
}

// Sessions

export type SessionId = string

export interface SessionContext {
  claim: string
  confidence: ConfidenceLevel
  reasons: string[]
}

export interface Session {
  context: SessionContext
  expiration: number
  history: ChatMessage[]
}

// Validation

export interface ValidationResponse {
  inappropriate: boolean
  isTruthClaim: boolean
  suggestions: string[]
}
