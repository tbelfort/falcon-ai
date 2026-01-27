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

export const PAGINATION = {
  defaultPage: 1,
  defaultPerPage: 50,
  maxPerPage: 100,
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

  // Check for Windows-style absolute paths with drive letters (e.g., C:\, D:/)
  // path.isAbsolute() won't catch these on Unix systems
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }

  if (value.startsWith('\\') || value.startsWith('//')) {
    return false;
  }

  const segments = value.split(/[\\/]+/).filter(Boolean);
  return !segments.includes('..');
}

export function parsePagination(
  pageValue: unknown,
  perPageValue: unknown
): { page: number; perPage: number } | null {
  const page = parsePositiveInt(pageValue);
  const perPage = parsePositiveInt(perPageValue);

  if (pageValue !== undefined && page === null) {
    return null;
  }

  if (perPageValue !== undefined && perPage === null) {
    return null;
  }

  const resolvedPage = page ?? PAGINATION.defaultPage;
  const resolvedPerPage = Math.min(
    perPage ?? PAGINATION.defaultPerPage,
    PAGINATION.maxPerPage
  );

  return {
    page: resolvedPage,
    perPage: resolvedPerPage,
  };
}

function parsePositiveInt(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed > 0 ? parsed : null;
}
