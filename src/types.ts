export * from 'aws-lambda'

// Chatting

export interface ChatMessage {
  content: string
  role: 'assistant' | 'user'
}

export interface ConversationStep {
  isFinalStep?: boolean
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

export interface ConfidenceChangeRequest {
  confidence: string
}

// Prompts

export type PromptId = string

export type ThinkingConfig =
  | { type: 'enabled'; budgetTokens: number }
  | { type: 'adaptive'; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }
  | { type: 'disabled' }

export interface PromptConfig {
  anthropicVersion: string
  maxTokens: number
  model: string
  thinking: ThinkingConfig
}

export interface Prompt {
  config: PromptConfig
  contents: string
}

// _T is a phantom type parameter (unused in the fields) so invokeModel
// can infer its return type from the schema argument instead of an explicit type argument.
export interface ResponseSchema<_T> {
  toolName: string
  toolDescription: string
  jsonSchema: object
}

// LLM interactions

export interface LLMRequest {
  message: ChatMessage
}

export interface LLMResponse {
  correct?: boolean
  finished: boolean
  message: string
  question?: number
  reasons?: string[]
}

export interface UserMessage {
  content: string
  role: 'user'
}

export interface AssistantMessage {
  content: LLMResponse
  role: 'assistant'
}

export type LLMMessage = UserMessage | AssistantMessage

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
  incorrect_guesses: number
  llmHistory: LLMMessage[]
  loadingTimeout?: number
  newConversation: boolean
  originalConfidence: string
  overrideStep?: ConversationStep
  question: number
  storedMessage?: ChatMessage
}

// Suggest claims

export interface SuggestClaimsRequest {
  language: string
}

export interface SuggestClaimsResponse {
  suggestions: string[]
}

export interface SuggestClaimsRecord {
  claims?: string[]
  createdAt: number
  generating?: boolean
  language: string
}

// Validation

export interface ValidationResponse {
  inappropriate: boolean
  suggestions: string[]
}
