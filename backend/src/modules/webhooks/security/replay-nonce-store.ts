import { Injectable } from '@nestjs/common';

/**
 * In-memory nonce replay prevention.
 *
 * Notes:
 * - Works for a single application instance.
 * - Good enough for correctness & tests.
 * - In production, consider a shared cache (Redis) keyed by nonce.
 */
@Injectable()
export class ReplayNonceStore {
  private readonly nonces = new Map<string, number>();
  private readonly maxTtlMs: number;

  constructor() {
    // Default TTL window (will be bounded by verifier's window as well)
    this.maxTtlMs = 15 * 60 * 1000;
  }

  /** Returns true if nonce is new (and registers it), false if it's a replay. */
  consume(nonce: string, nowMs: number, windowMs: number): boolean {
    this.gc(nowMs);

    const existingAt = this.nonces.get(nonce);
    if (existingAt !== undefined) return false;

    // Only store until (now + min(windowMs, maxTtlMs))
    const ttl = Math.min(windowMs, this.maxTtlMs);
    this.nonces.set(nonce, nowMs + ttl);
    return true;
  }

  private gc(nowMs: number): void {
    for (const [nonce, expiresAt] of this.nonces.entries()) {
      if (expiresAt <= nowMs) this.nonces.delete(nonce);
    }
  }
}

