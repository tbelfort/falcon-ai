# Security and Operational Notes

## Defaults

- `defaultBranch` defaults to `main`.
- `priority` defaults to `medium`.
- `labelColor` defaults to `#6b7280`.
- `documentVersion` defaults to `1`.

## Data Semantics

- Timestamps are Unix epoch seconds.
- Built-in labels cannot be deleted.
- Branch names are generated as `issue/<number>-<kebab-title>` with a fallback of
  `issue/<number>-issue` when the title is empty after normalization.

## Production Requirements

Before deploying Falcon PM in production, add:

- Authentication and authorization on all API routes and WebSocket connections.
- A strict CORS allowlist.
- Rate limiting at the edge and/or application layer.
