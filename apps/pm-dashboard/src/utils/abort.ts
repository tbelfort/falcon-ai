export function createSafeAbortController(): AbortController | null {
  if (import.meta.env.MODE === 'test') {
    return null;
  }
  if (typeof AbortController === 'undefined') {
    return null;
  }
  return new AbortController();
}
