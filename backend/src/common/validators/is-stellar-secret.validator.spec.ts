import { validate } from 'class-validator';
import { IsStellarSecretKey } from './is-stellar-secret.validator';

class TestDto {
  @IsStellarSecretKey()
  secret: any;
}

function createDto(secret: any): TestDto {
  const dto = new TestDto();
  dto.secret = secret;
  return dto;
}

describe('IsStellarSecretKey', () => {
  it('should accept valid Stellar secret key', async () => {
    const validKey = 'S' + 'A'.repeat(55);
    const errors = await validate(createDto(validKey));
    expect(errors).toHaveLength(0);
  });

  it('should accept key with valid Base32 characters', async () => {
    const validKey = 'SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    const errors = await validate(createDto(validKey));
    expect(errors).toHaveLength(0);
  });

  it('should reject key not starting with S', async () => {
    const invalidKey = 'G' + 'A'.repeat(55);
    const errors = await validate(createDto(invalidKey));
    expect(errors).toHaveLength(1);
  });

  it('should reject key with wrong length', async () => {
    const shortKey = 'S' + 'A'.repeat(50);
    const errors = await validate(createDto(shortKey));
    expect(errors).toHaveLength(1);
  });

  it('should reject key with invalid Base32 characters', async () => {
    const invalidKey = 'S' + '1'.repeat(55);
    const errors = await validate(createDto(invalidKey));
    expect(errors).toHaveLength(1);
  });

  it('should reject non-string values', async () => {
    const errors = await validate(createDto(12345));
    expect(errors).toHaveLength(1);
  });

  it('should reject lowercase keys', async () => {
    const invalidKey = 's' + 'a'.repeat(55);
    const errors = await validate(createDto(invalidKey));
    expect(errors).toHaveLength(1);
  });
});
