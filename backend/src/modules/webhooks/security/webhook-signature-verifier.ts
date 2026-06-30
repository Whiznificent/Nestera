import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  WebhookVerificationErrorCode,
  WebhookVerificationErrorPayload,
} from './webhook-verification.errors';
import { ReplayNonceStore } from './replay-nonce-store';

export type WebhookSignatureVerifierOptions = {
  secret: string;
  /** Header name that carries the signature */
  signatureHeader: string;
  /** Header name that carries the timestamp */
  timestampHeader: string;
  /** Header name that carries the nonce */
  nonceHeader: string;
  /** Allowed timestamp drift */
  maxTimestampSkewMs: number;
  /** Signature scheme prefix (e.g. "sha256=") */
  signaturePrefix?: string;
};

@Injectable()
export class WebhookSignatureVerifier {
  constructor(private readonly nonceStore: ReplayNonceStore) {}

  verifyIncomingWebhook(params: {
    payload: unknown;
    headers: Record<string, string | string[] | undefined>;
    options: WebhookSignatureVerifierOptions;
  }): true {
    const { payload, headers, options } = params;
    const secret = options.secret || '';

    const signatureHeaderValue = headers[options.signatureHeader];
    const signature = Array.isArray(signatureHeaderValue)
      ? signatureHeaderValue[0]
      : signatureHeaderValue;

    if (!signature) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.MISSING_SIGNATURE,
        message: 'Missing webhook signature header',
      });
    }

    const timestampHeaderValue = headers[options.timestampHeader];
    const timestampRaw = Array.isArray(timestampHeaderValue)
      ? timestampHeaderValue[0]
      : timestampHeaderValue;

    if (!timestampRaw) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.MISSING_TIMESTAMP,
        message: `Missing ${options.timestampHeader} header`,
      });
    }

    const timestampMs = Number(timestampRaw);
    if (!Number.isFinite(timestampMs)) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.INVALID_TIMESTAMP,
        message: `Invalid ${options.timestampHeader} header`,
        details: { timestampRaw },
      });
    }

    const nowMs = Date.now();
    const skew = Math.abs(nowMs - timestampMs);

    if (skew > options.maxTimestampSkewMs) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.INVALID_TIMESTAMP,
        message: 'Webhook timestamp outside allowed window',
        details: { skewMs: skew, maxSkewMs: options.maxTimestampSkewMs },
      });
    }

    const nonceHeaderValue = headers[options.nonceHeader];
    const nonce = Array.isArray(nonceHeaderValue)
      ? nonceHeaderValue[0]
      : nonceHeaderValue;

    if (!nonce) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.MISSING_NONCE,
        message: `Missing ${options.nonceHeader} header`,
      });
    }

    const windowMs = options.maxTimestampSkewMs;
    const consumed = this.nonceStore.consume(nonce, nowMs, windowMs);
    if (!consumed) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.REPLAYED_NONCE,
        message: 'Webhook nonce replay detected',
        details: { nonce },
      });
    }

    // Deterministic payload serialization strategy:
    // - We expect the sender signs the JSON stringification.
    // - For safety, we use the raw body if provided as a string.
    const bodyString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const signaturePrefix = options.signaturePrefix ?? '';

    const expectedRaw = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');

    // Accept either:
    // - raw hex (when prefix is empty)
    // - or prefix + hex (when prefix is provided)
    const expected = signaturePrefix
      ? `${signaturePrefix}${expectedRaw}`
      : expectedRaw;

    if (!this.timingSafeEqual(signature, expected)) {
      throw this.buildUnauthorized({
        code: WebhookVerificationErrorCode.INVALID_SIGNATURE,
        message: 'Invalid webhook signature',
      });
    }

    return true;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(a),
        Buffer.from(b),
      );
    } catch {
      return false;
    }
  }

  private buildUnauthorized(payload: WebhookVerificationErrorPayload) {
    // Include machine-readable code in the response body.
    return new UnauthorizedException({
      message: payload.message,
      code: payload.code,
      details: payload.details,
    });
  }
}

