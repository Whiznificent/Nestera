import { ApiProperty } from '@nestjs/swagger';
import { StandardErrorResponseDto } from './standard-error-response.dto';
import { ErrorCode } from '../enums/error-code.enum';

export class ApiErrorResponseDto extends StandardErrorResponseDto {
  @ApiProperty({
    enum: ErrorCode,
    example: ErrorCode.BAD_REQUEST,
    description: 'Stable, machine-readable error code',
  })
  declare errorCode: ErrorCode;
}

export class ValidationErrorDto extends ApiErrorResponseDto {
  @ApiProperty({ example: 422 })
  statusCode = 422;

  @ApiProperty({ enum: [ErrorCode.VALIDATION_ERROR] })
  errorCode = ErrorCode.VALIDATION_ERROR;

  @ApiProperty({
    example: [
      {
        field: 'goalName',
        value: '',
        constraints: {
          isNotEmpty: 'goalName should not be empty',
        },
      },
    ],
    description: 'Per-field validation errors',
  })
  declare errors?: Array<{
    field: string;
    value?: unknown;
    constraints: Record<string, string>;
  }>;
}

export class UnauthorizedErrorDto extends ApiErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode = 401;

  @ApiProperty({ enum: [ErrorCode.UNAUTHORIZED] })
  errorCode = ErrorCode.UNAUTHORIZED;
}

export class ForbiddenErrorDto extends ApiErrorResponseDto {
  @ApiProperty({ example: 403 })
  statusCode = 403;

  @ApiProperty({ enum: [ErrorCode.FORBIDDEN] })
  errorCode = ErrorCode.FORBIDDEN;
}

export class NotFoundErrorDto extends ApiErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode = 404;

  @ApiProperty({ enum: [ErrorCode.NOT_FOUND] })
  errorCode = ErrorCode.NOT_FOUND;
}

export class ConflictErrorDto extends ApiErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode = 409;

  @ApiProperty({ enum: [ErrorCode.CONFLICT] })
  errorCode = ErrorCode.CONFLICT;
}
