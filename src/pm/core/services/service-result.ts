import type { WsEvent } from '../../contracts/ws.js';
import type { ServiceError } from '../errors.js';

export type ServiceResult<T> =
  | { ok: true; value: T; events: WsEvent[] }
  | { ok: false; error: ServiceError };

export function ok<T>(value: T, events: WsEvent[] = []): ServiceResult<T> {
  return { ok: true, value, events };
}

export function err<T>(error: ServiceError): ServiceResult<T> {
  return { ok: false, error };
}
