import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';

export interface DomainExceptionOptions {
  errorCode: ErrorCode;
  message: string;
  statusCode?: HttpStatus;
  details?: Record<string, unknown> | Array<Record<string, unknown>>;
  docsUrl?: string;
}

export class DomainException extends HttpException {
  public readonly errorCode: ErrorCode;
  public readonly details?:
    | Record<string, unknown>
    | Array<Record<string, unknown>>;
  public readonly docsUrl?: string;

  constructor(options: DomainExceptionOptions) {
    const status = options.statusCode ?? HttpStatus.BAD_REQUEST;
    super(
      {
        errorCode: options.errorCode,
        message: options.message,
        details: options.details,
        docsUrl: options.docsUrl,
      },
      status,
    );
    this.errorCode = options.errorCode;
    this.details = options.details;
    this.docsUrl = options.docsUrl;
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      errorCode: ErrorCode.INSUFFICIENT_BALANCE,
      message: 'Insufficient balance to complete this operation',
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export class InvalidGovernanceStateException extends DomainException {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      errorCode: ErrorCode.INVALID_GOVERNANCE_STATE,
      message,
      statusCode: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resource: string, id?: string) {
    super({
      errorCode: ErrorCode.NOT_FOUND,
      message: id ? `${resource} '${id}' not found` : `${resource} not found`,
      statusCode: HttpStatus.NOT_FOUND,
    });
  }
}
