import { validate } from 'class-validator';
import { IsTransactionHash } from './is-transaction-hash.validator';

class TestDto {
  @IsTransactionHash()
  hash: any;
}

function createDto(hash: any): TestDto {
  const dto = new TestDto();
  dto.hash = hash;
  return dto;
}

describe('IsTransactionHash', () => {
  it('should accept valid 64-char lowercase hex hash', async () => {
    const validHash = 'a'.repeat(64);
    const errors = await validate(createDto(validHash));
    expect(errors).toHaveLength(0);
  });

  it('should accept mixed hex characters', async () => {
    const validHash = 'abcdef0123456789'.repeat(4);
    const errors = await validate(createDto(validHash));
    expect(errors).toHaveLength(0);
  });

  it('should reject uppercase hex', async () => {
    const invalidHash = 'A'.repeat(64);
    const errors = await validate(createDto(invalidHash));
    expect(errors).toHaveLength(1);
  });

  it('should reject short hashes', async () => {
    const errors = await validate(createDto('abcdef'));
    expect(errors).toHaveLength(1);
  });

  it('should reject long hashes', async () => {
    const errors = await validate(createDto('a'.repeat(65)));
    expect(errors).toHaveLength(1);
  });

  it('should reject non-hex characters', async () => {
    const invalidHash = 'g'.repeat(64);
    const errors = await validate(createDto(invalidHash));
    expect(errors).toHaveLength(1);
  });

  it('should reject non-string values', async () => {
    const errors = await validate(createDto(12345));
    expect(errors).toHaveLength(1);
  });

  it('should reject null', async () => {
    const errors = await validate(createDto(null));
    expect(errors).toHaveLength(1);
  });
});
