import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_KEY = 'idempotency';

export interface IdempotencyOptions {
  ttlSeconds?: number;
}

export const Idempotent = (options?: IdempotencyOptions) =>
  SetMetadata(IDEMPOTENCY_KEY, { ttlSeconds: options?.ttlSeconds ?? 86400 });
