import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const ADMIN_HIGH_RISK_KEY = 'admin:high-risk';

/**
 * Marks an endpoint as high-risk for admin operations.
 * Applies strict rate limiting (2 requests per 5 minutes) and
 * requires confirmation before execution.
 */
export function AdminHighRisk() {
  return applyDecorators(
    SetMetadata(ADMIN_HIGH_RISK_KEY, true),
    Throttle({ 'admin-high-risk': { limit: 2, ttl: 5 * 60 * 1000 } }),
  );
}
