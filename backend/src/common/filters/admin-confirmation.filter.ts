import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Response } from 'express';
import { ForbiddenException } from '@nestjs/common';
import { AdminConfirmationService } from '../../modules/admin/admin-confirmation.service';

@Catch(ForbiddenException)
@Injectable()
export class AdminConfirmationFilter implements ExceptionFilter {
  constructor(
    @Optional()
    private readonly confirmationService?: AdminConfirmationService,
  ) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const message = exception.getResponse() as any;

    // Only intercept high-risk confirmation errors
    if (
      typeof message === 'object' &&
      message.message?.includes('high-risk operation')
    ) {
      const user = request.user;
      const actionType = `${request.method}:${request.path}`;

      const confirmationData: any = {
        confirmationRequired: true,
        message: message.message,
        actionType,
        nextStep:
          'Request a confirmation token by calling this endpoint again, then retry with X-Confirm-Token header',
      };

      // Request a confirmation token
      if (this.confirmationService && user?.id) {
        try {
          const confirmation =
            await this.confirmationService.requestConfirmation(
              user.id,
              actionType,
              {
                path: request.path,
                method: request.method,
                body: request.body,
                query: request.query,
              },
            );

          confirmationData.confirmationToken = confirmation.confirmationToken;
          confirmationData.expiresAt = confirmation.expiresAt;
        } catch (err) {
          // Silently fail - still return 403
        }
      }

      return response.status(403).json(confirmationData);
    }

    // Pass through other forbidden exceptions
    return response.status(exception.getStatus()).json(exception.getResponse());
  }
}
