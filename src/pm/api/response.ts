import type { Response } from 'express';
import type { ApiMeta, ApiSuccess } from '../contracts/http.js';

export function sendSuccess<T>(
  res: Response,
  data: T,
  meta?: ApiMeta
): Response<ApiSuccess<T>> {
  if (meta) {
    return res.json({ data, meta });
  }

  return res.json({ data });
}
