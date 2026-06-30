import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_HIGH_RISK_KEY } from '../decorators/admin-high-risk.decorator';

/**
 * Guard that enforces confirmation for high-risk admin endpoints.
 * Checks for X-Confirm-Token header. If token is missing, throws 403 with instructions.
 * Token verification is handled by the interceptor.
 */
@Injectable()
export class AdminConfirmationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isHighRisk = this.reflector.get<boolean>(
      ADMIN_HIGH_RISK_KEY,
      context.getHandler(),
    );

    if (!isHighRisk) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const confirmationToken = request.headers['x-confirm-token'];

    if (!confirmationToken) {
      throw new ForbiddenException(
        'This is a high-risk operation and requires confirmation. ' +
          'Call this endpoint without the X-Confirm-Token header first to receive a confirmation token, ' +
          'then retry with that token in the X-Confirm-Token header.',
      );
    }

    return true;
  }
}
