import type { IncomingHttpHeaders } from 'node:http';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5173',
];

export function resolveAuthToken(explicit?: string): string {
  const token = explicit ?? process.env.PM_API_TOKEN;
  if (!token || token.trim() === '') {
    throw new Error('PM_API_TOKEN is required to start the API server');
  }
  return token;
}

export function resolveAllowedOrigins(explicit?: string[]): string[] {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  const fromEnv = process.env.PM_API_ALLOWED_ORIGINS;
  if (!fromEnv) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  const origins = fromEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : DEFAULT_ALLOWED_ORIGINS;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[]
): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

export function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || !token) {
    return null;
  }
  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }
  return token;
}

export function extractAuthTokenFromHeaders(
  headers: IncomingHttpHeaders
): string | null {
  const authorization = headers.authorization;
  const authHeader = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  const bearer = extractBearerToken(authHeader);
  if (bearer) {
    return bearer;
  }
  const apiKeyHeader = headers['x-api-key'];
  if (Array.isArray(apiKeyHeader)) {
    return apiKeyHeader[0] ?? null;
  }
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }
  return null;
}
