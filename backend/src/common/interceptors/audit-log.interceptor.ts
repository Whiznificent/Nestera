import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log.service';
import { AuditAction, AuditResourceType } from '../entities/audit-log.entity';
import { AUDIT_LOG_METADATA } from '../decorators/audit-log.decorator';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    @Optional() private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATION_METHODS.has(request.method)) {
      return next.handle();
    }

    // Check for explicit @AuditLog decorator or fall back to path-based detection
    const metadata = this.reflector.getAllAndOverride<{
      action?: AuditAction;
      resourceType?: AuditResourceType;
      description?: string;
    } | null>(AUDIT_LOG_METADATA, [context.getHandler(), context.getClass()]);

    const isAuditableByPath =
      /\/(claims|disputes|trades|savings|users|kyc|admin|withdrawals)/.test(
        request.url,
      );

    if (!metadata && !isAuditableByPath) {
      return next.handle();
    }

    const startTime = Date.now();
    const response = context.switchToHttp().getResponse<Response>();
    const correlationId = (request as any).correlationId ?? 'unknown';
    const actor =
      (request.user as any)?.email ??
      (request.user as any)?.id ??
      request.body?.email ??
      'anonymous';
    const resourceId: string | null =
      (typeof request.params?.id === 'string' ? request.params.id : null) ??
      (typeof request.body?.id === 'string' ? request.body.id : null);
    const ipAddress: string | undefined = (() => {
      const fwd = request.headers['x-forwarded-for'];
      if (!fwd) return request.socket.remoteAddress ?? undefined;
      const first = Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0];
      return first?.trim() ?? request.socket.remoteAddress ?? undefined;
    })();
    const userAgent: string | undefined = (() => {
      const ua = request.headers['user-agent'];
      return (Array.isArray(ua) ? ua[0] : ua) ?? undefined;
    })();

    const action =
      metadata?.action ?? this.inferAction(request.method, request.url);
    const resourceType =
      metadata?.resourceType ?? this.inferResourceType(request.url);
    const description = metadata?.description;

    return next.handle().pipe(
      tap(() => {
        void this.auditLogService?.log({
          correlationId,
          endpoint: request.url,
          method: request.method,
          action,
          actor,
          resourceId,
          resourceType,
          statusCode: response.statusCode,
          durationMs: Date.now() - startTime,
          success: true,
          ipAddress,
          userAgent,
          description,
        });
      }),
      catchError((error) => {
        void this.auditLogService?.log({
          correlationId,
          endpoint: request.url,
          method: request.method,
          action,
          actor,
          resourceId,
          resourceType,
          statusCode: error.status ?? 500,
          durationMs: Date.now() - startTime,
          success: false,
          errorMessage: error.message,
          ipAddress,
          userAgent,
          description,
        });
        return throwError(() => error);
      }),
    );
  }

  private inferAction(method: string, url: string): AuditAction {
    if (url.includes('/approve')) return AuditAction.APPROVE;
    if (url.includes('/reject')) return AuditAction.REJECT;
    if (url.includes('/escalate')) return AuditAction.ESCALATE;
    if (url.includes('/resolve')) return AuditAction.RESOLVE;
    if (url.includes('/export')) return AuditAction.EXPORT;
    if (method === 'POST') return AuditAction.CREATE;
    if (method === 'PATCH' || method === 'PUT') return AuditAction.UPDATE;
    if (method === 'DELETE') return AuditAction.DELETE;
    return AuditAction.UPDATE;
  }

  private inferResourceType(url: string): AuditResourceType {
    if (url.includes('/claims')) return AuditResourceType.CLAIM;
    if (url.includes('/disputes')) return AuditResourceType.DISPUTE;
    if (url.includes('/savings')) return AuditResourceType.SAVINGS;
    if (url.includes('/transactions')) return AuditResourceType.TRANSACTION;
    if (url.includes('/kyc')) return AuditResourceType.KYC;
    if (url.includes('/notifications')) return AuditResourceType.NOTIFICATION;
    if (url.includes('/users') || url.includes('/user'))
      return AuditResourceType.USER;
    if (url.includes('/admin')) return AuditResourceType.ADMIN;
    if (url.includes('/withdrawals'))
      return AuditResourceType.WITHDRAWAL_REQUEST;
    return AuditResourceType.SYSTEM;
  }
}
