import { ConversationStep } from '../types'

export const conversationSteps: ConversationStep[] = [
  { label: 'Introduction', path: 'start-chat', value: 'start' },
  { label: 'Confidence', path: 'probe-confidence', value: 'probe confidence' },
  { label: 'Reasons', path: 'probe-reasons', value: 'probe reasons' },
  { label: 'Opposing reasons', path: 'guess-reasons', value: 'guess reasons' },
  { isFinalStep: true, label: 'Conclusion', path: 'end-chat', value: 'end' },
]
