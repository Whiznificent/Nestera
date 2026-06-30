import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AdminConfirmationService } from '../../modules/admin/admin-confirmation.service';
import { ADMIN_HIGH_RISK_KEY } from '../decorators/admin-high-risk.decorator';

/**
 * Interceptor to verify admin confirmation tokens for high-risk operations.
 * If X-Confirm-Token header is present, verifies it before allowing the handler to execute.
 */
@Injectable()
export class AdminConfirmationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Optional()
    private readonly confirmationService?: AdminConfirmationService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const isHighRisk = this.reflector.get<boolean>(
      ADMIN_HIGH_RISK_KEY,
      context.getHandler(),
    );

    if (!isHighRisk) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const confirmationToken = request.headers['x-confirm-token'];

    if (confirmationToken && this.confirmationService && user?.id) {
      const actionType = `${request.method}:${request.path}`;

      try {
        await this.confirmationService.verifyConfirmation(
          confirmationToken as string,
          user.id,
          actionType,
        );
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw err;
        }
        throw new BadRequestException('Failed to verify confirmation token');
      }
    }

    return next.handle();
  }
}
