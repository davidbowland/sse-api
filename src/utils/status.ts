/* eslint-disable sort-keys */

export default {
  OK: { statusCode: 200 },
  CREATED: { statusCode: 201 },
  NO_CONTENT: { statusCode: 204, body: '' },
  BAD_REQUEST: { statusCode: 400, body: '{"message":"Bad request"}' },
  UNAUTHORIZED: { statusCode: 401, body: '{"message":"Unauthorized"}' },
  FORBIDDEN: { statusCode: 403 },
  NOT_FOUND: { statusCode: 404, body: '{"message":"Not found"}' },
  CONFLICT: { statusCode: 409, body: '{"message":"Conflict"}' },
  INTERNAL_SERVER_ERROR: { statusCode: 500, body: '{"message":"Internal server error"}' },
}
