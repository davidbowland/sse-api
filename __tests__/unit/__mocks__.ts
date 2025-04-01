/* eslint sort-keys:0 */
import { ChatMessage, Prompt, PromptConfig, PromptId, Session, SessionId } from '@types'

// Bedrock

export const invokeModelSuggestedClaims = [
  'Voter ID requirements strengthen democracy.',
  'Museums in federal agencies are a waste of taxpayer money.',
  'Universities should lose federal funding over antisemitism.',
  'The president should have the power to serve unlimited terms.',
  'The US should implement a 100% tariff on all foreign goods.',
  'Congress should abolish collective bargaining for federal employees.',
]

export const invokeModelSuggestedClaimsResponseData = {
  id: 'msg_bdrk_01YA7pmVfUZvZM9reruSimYT',
  type: 'message',
  role: 'assistant',
  model: 'claude-3-5-sonnet-20241022',
  content: [
    {
      type: 'text',
      text:
        '{\n' +
        '  "suggestions": [\n' +
        '    "Voter ID requirements strengthen democracy.",\n' +
        '    "Museums in federal agencies are a waste of taxpayer money.",\n' +
        '    "Universities should lose federal funding over antisemitism.",\n' +
        '    "The president should have the power to serve unlimited terms.",\n' +
        '    "The US should implement a 100% tariff on all foreign goods.",\n' +
        '    "Congress should abolish collective bargaining for federal employees."\n' +
        '  ]\n' +
        '}',
    },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 3398, output_tokens: 99 },
}

export const invokeModelSuggestedClaimsResponse = {
  $metadata: {
    attempts: 1,
    cfId: undefined,
    extendedRequestId: undefined,
    httpStatusCode: 200,
    requestId: 'fragglerock',
    retryDelay: 0,
    statusCode: 200,
    success: true,
    totalRetryDelay: 0,
  },
  body: new TextEncoder().encode(JSON.stringify(invokeModelSuggestedClaimsResponseData)),
}

// Messages

export const assistantMessage: ChatMessage = { content: 'Whatchu mean?', role: 'assistant' }
export const userMessage: ChatMessage = { content: 'I think I saw a cat', role: 'user' }

// Prompts

export const promptConfig: PromptConfig = {
  anthropicVersion: 'bedrock-2023-05-31',
  maxTokens: 256,
  model: 'the-best-ai:1.0',
  temperature: 0.5,
  topK: 250,
}

export const promptId: PromptId = '5253'

export const prompt: Prompt = {
  config: promptConfig,
  contents: 'You are a helpful assistant. ${data}',
}

// Sessions

export const sessionId: SessionId = '34151'

export const session: Session = {
  claim: 'Spiders are real',
  confidence: 'strongly agree',
  expiration: 1743407368,
  history: [userMessage, assistantMessage],
  reasons: ["They're animatronic"],
}

// Claims

export const claimSourcesRaw = `
\\"title\\":\\"Russia's war economy fuels rustbelt revival\\"',
\\"title\\":\\"Russian Rustbelt Sees Economic Growth as War Production Drives Local Business\\"',
\\"title\\":\\"Man Suspected of Accidentally Starting South Korea's Largest Wildfires\\"",
\\"title\\":\\"South Korea Battles Deadliest Wildfire After Ancestral Ritual Sparks Massive Blaze\\"',
\\"title\\":\\"Three US Soldiers Found Dead After Vehicle Recovered in Lithuanian Swamp\\"',
\\"title\\":\\"US Military Races Against Time to Recover Four Soldiers in Lithuanian Bog\\"',
`

export const claimSources = [
  "Russia's war economy fuels rustbelt revival",
  'Russian Rustbelt Sees Economic Growth as War Production Drives Local Business',
  "Man Suspected of Accidentally Starting South Korea's Largest Wildfires",
  'South Korea Battles Deadliest Wildfire After Ancestral Ritual Sparks Massive Blaze',
  'Three US Soldiers Found Dead After Vehicle Recovered in Lithuanian Swamp',
  'US Military Races Against Time to Recover Four Soldiers in Lithuanian Bog',
]

// Validation

export const validationResult = {
  inappropriate: false,
  isTruthClaim: true,
  suggestions: [
    'Military intervention causes more harm than good.',
    'The world would be more peaceful with less US military intervention.',
    'US military spending should be reduced.',
    'The US should only intervene militarily when directly attacked.',
    'US foreign policy should focus on diplomacy rather than military action.',
  ],
}
