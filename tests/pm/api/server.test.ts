import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { resolveCorsOrigins } from '../../../src/pm/api/server.js';

describe('resolveCorsOrigins', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns default localhost origins when env var not set', () => {
    delete process.env.FALCON_PM_CORS_ORIGINS;
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('parses comma-separated origins from env var', () => {
    process.env.FALCON_PM_CORS_ORIGINS = 'https://app.example.com,https://admin.example.com';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('trims whitespace from origins', () => {
    process.env.FALCON_PM_CORS_ORIGINS = '  https://app.example.com  ,  https://admin.example.com  ';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('filters out empty strings', () => {
    process.env.FALCON_PM_CORS_ORIGINS = 'https://app.example.com,,https://admin.example.com,';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('returns defaults when env var is empty string', () => {
    process.env.FALCON_PM_CORS_ORIGINS = '';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('returns defaults when env var is only whitespace', () => {
    process.env.FALCON_PM_CORS_ORIGINS = '   ';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual([
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('handles single origin', () => {
    process.env.FALCON_PM_CORS_ORIGINS = 'https://single.example.com';
    const origins = resolveCorsOrigins();
    expect(origins).toEqual(['https://single.example.com']);
  });
});
