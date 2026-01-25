import path from 'node:path';

export const LIMITS = {
  id: 100,
  name: 200,
  slug: 120,
  title: 200,
  description: 5000,
  comment: 5000,
  authorName: 100,
  color: 50,
  filePath: 500,
  contentHash: 256,
  branch: 100,
  url: 500,
  labelIds: 50,
} as const;

export function requireString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSafeRelativePath(value: string): boolean {
  if (path.isAbsolute(value)) {
    return false;
  }

  if (value.startsWith('\\') || value.startsWith('//')) {
    return false;
  }

  const segments = value.split(/[\\/]+/).filter(Boolean);
  return !segments.includes('..');
}
