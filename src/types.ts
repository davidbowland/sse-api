export * from 'aws-lambda'
export { Operation as PatchOperation } from 'fast-json-patch'

// Chatting

export interface ChatMessage {
  content: string
  role: 'assistant' | 'user'
}

export interface ConversationStep {
  isFinalStep?: boolean
  isOverride?: boolean
  label: string
  path: string
  value: string
}

export interface Dividers {
  [key: number]: {
    label: string
  }
}

// Claims

export interface Claim {
  claim: string
  language: string
}

// Confidence Levels

export interface ConfidenceLevel {
  label: string
  text: string
  value: string
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
  language: string
  message: ChatMessage
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
  confidence: string
  generatedReasons: string[]
  language: string
  possibleConfidenceLevels: ConfidenceLevel[]
}

export interface Session {
  context: SessionContext
  conversationSteps: ConversationStep[]
  currentStep?: string
  dividers: Dividers
  expiration: number
  history: ChatMessage[]
  newConversation: boolean
  originalConfidence: string
  overrideStep?: ConversationStep
}

// Suggest claims

export interface SuggestClaimsRequest {
  language: string
}

// Validation

export interface ValidationResponse {
  inappropriate: boolean
  isTruthClaim: boolean
  suggestions: string[]
}
