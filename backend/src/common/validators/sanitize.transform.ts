import { Transform } from 'class-transformer';

export function Trim() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

const CONTROL_CHAR_PATTERN = new RegExp(
  '[' +
    String.fromCharCode(0) +
    '-' +
    String.fromCharCode(8) +
    String.fromCharCode(11) +
    String.fromCharCode(12) +
    String.fromCharCode(14) +
    '-' +
    String.fromCharCode(31) +
    String.fromCharCode(127) +
    ']',
  'g',
);

export function StripControlChars() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.replace(CONTROL_CHAR_PATTERN, '') : value,
  );
}

export function Sanitize() {
  return function (target: any, propertyKey: string) {
    Trim()(target, propertyKey);
    StripControlChars()(target, propertyKey);
  };
}
