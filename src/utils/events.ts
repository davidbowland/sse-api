import { APIGatewayProxyEventV2, Claim } from '../types'
import AJV from 'ajv/dist/jtd'

const ajv = new AJV({ allErrors: true })

// Claims

const formatClaim = (body: any): Claim => {
  const jsonTypeDefinition = {
    properties: {
      claim: { type: 'string' },
    },
  }
  if (ajv.validate(jsonTypeDefinition, body) === false) {
    throw new Error(JSON.stringify(ajv.errors))
  }
  return body
}

export const extractClaimFromEvent = (event: APIGatewayProxyEventV2): Claim => formatClaim(parseEventBody(event))

// Events

const parseEventBody = (event: APIGatewayProxyEventV2): any =>
  JSON.parse(
    event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : (event.body as string),
  )
