export function assertNever(value: never, message = 'Unhandled case'): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
