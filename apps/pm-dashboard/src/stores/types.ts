export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

export const idleState = { status: 'idle' } as const;
export const loadingState = { status: 'loading' } as const;

export function successState<T>(data: T): AsyncState<T> {
  return { status: 'success', data };
}

export function errorState<T>(error: string): AsyncState<T> {
  return { status: 'error', error };
}
