import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureVerifier } from '../security/webhook-signature-verifier';

@Injectable()
export class WebhookVerificationMiddleware implements NestMiddleware {
  constructor(
    private readonly configService: ConfigService,
    private readonly verifier: WebhookSignatureVerifier,
  ) {}

  use(req: Request, res: Response, next: (err?: any) => void): void {
    const secret = this.configService.get<string>('stellar.webhookSecret') || '';

    // For Stellar webhooks, we use:
    // - signature header: x-stellar-signature (hex)
    // - timestamp/nonce headers: x-nestera-timestamp, x-nestera-nonce
    // If provider doesn't send timestamp/nonce, verification will fail.

    this.verifier.verifyIncomingWebhook({
      payload: (req as any).body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      options: {
        secret,
        signatureHeader: 'x-stellar-signature',
        timestampHeader: 'x-nestera-timestamp',
        nonceHeader: 'x-nestera-nonce',
        maxTimestampSkewMs:
          Number(this.configService.get('WEBHOOK_MAX_SKEW_MS')) || 5 * 60 * 1000,
        signaturePrefix: '',
      },
    });

    next();
  }
}

