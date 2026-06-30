import { validate } from 'class-validator';
import { IsPositiveAmount } from './is-positive-amount.validator';

class TestDto {
  @IsPositiveAmount(7)
  amount: any;
}

function createDto(amount: any): TestDto {
  const dto = new TestDto();
  dto.amount = amount;
  return dto;
}

describe('IsPositiveAmount', () => {
  it('should accept valid positive amounts', async () => {
    const validAmounts = [0.01, 1, 100, 50000.1234567, 999999999];
    for (const amount of validAmounts) {
      const errors = await validate(createDto(amount));
      expect(errors).toHaveLength(0);
    }
  });

  it('should reject zero', async () => {
    const errors = await validate(createDto(0));
    expect(errors).toHaveLength(1);
  });

  it('should reject negative numbers', async () => {
    const errors = await validate(createDto(-1));
    expect(errors).toHaveLength(1);
  });

  it('should reject NaN', async () => {
    const errors = await validate(createDto(NaN));
    expect(errors).toHaveLength(1);
  });

  it('should reject Infinity', async () => {
    const errors = await validate(createDto(Infinity));
    expect(errors).toHaveLength(1);
  });

  it('should reject strings', async () => {
    const errors = await validate(createDto('100'));
    expect(errors).toHaveLength(1);
  });

  it('should reject amounts with too many decimals', async () => {
    const errors = await validate(createDto(1.12345678));
    expect(errors).toHaveLength(1);
  });

  it('should accept amounts at the decimal limit', async () => {
    const errors = await validate(createDto(1.1234567));
    expect(errors).toHaveLength(0);
  });

  it('should work with custom decimal places', async () => {
    class TwoDecimalDto {
      @IsPositiveAmount(2)
      amount: any;
    }
    const dto = new TwoDecimalDto();
    dto.amount = 1.123;
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);

    dto.amount = 1.12;
    const errors2 = await validate(dto);
    expect(errors2).toHaveLength(0);
  });
});
