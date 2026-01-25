const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const TRIM_DASHES = /^-+|-+$/g;

export function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(TRIM_DASHES, '')
    .trim();
}
