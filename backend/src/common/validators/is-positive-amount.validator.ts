import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const MAX_DECIMAL_PLACES = 7; // Stellar uses 7 decimal places (stroops)

export function IsPositiveAmount(
  maxDecimals = MAX_DECIMAL_PLACES,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveAmount',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [maxDecimals],
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'number' || !isFinite(value)) return false;
          if (value <= 0) return false;

          const decimals = args.constraints[0] as number;
          const parts = value.toString().split('.');
          if (parts.length > 1 && parts[1].length > decimals) return false;

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const decimals = args.constraints[0] as number;
          return `${args.property} must be a positive number with at most ${decimals} decimal places`;
        },
      },
    });
  };
}

export function IsUSDCAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUSDCAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          const num =
            typeof value === 'string' ? parseFloat(value) : Number(value);
          if (!isFinite(num) || num <= 0) return false;
          const strVal = String(value);
          const decimalPart = strVal.split('.')[1] || '';
          return decimalPart.length <= 7;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a positive USDC amount with at most 7 decimal places`;
        },
      },
    });
  };
}

export function IsNonNegativeAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNonNegativeAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          const num =
            typeof value === 'string' ? parseFloat(value) : Number(value);
          return isFinite(num) && num >= 0;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a non-negative number`;
        },
      },
    });
  };
}
