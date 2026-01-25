export function toKebabCase(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const replaced = trimmed.replace(/[^a-z0-9]+/g, '-');
  const collapsed = replaced.replace(/^-+|-+$/g, '');
  return collapsed || 'issue';
}
