import { FileUploadConfigService } from './file-upload-config.service';
import { ConfigService } from '@nestjs/config';

describe('FileUploadConfigService', () => {
  let service: FileUploadConfigService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'upload.defaultMaxSize': 10 * 1024 * 1024,
          'upload.maxAvatarSize': 5 * 1024 * 1024,
          'upload.maxDocumentSize': 10 * 1024 * 1024,
          'upload.maxBackupRestoreSize': 1024 * 1024 * 1024,
          'upload.virusScanningEnabled': false,
        };
        return values[key];
      }),
    } as unknown as ConfigService;

    service = new FileUploadConfigService(configService);
  });

  describe('validateImageMagicBytes', () => {
    it('accepts valid PNG magic bytes', () => {
      const buffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const result = service.validateImageMagicBytes(buffer, 'image/png');
      expect(result.valid).toBe(true);
    });

    it('accepts valid JPEG magic bytes', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = service.validateImageMagicBytes(buffer, 'image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('rejects mismatched content and MIME type', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const result = service.validateImageMagicBytes(buffer, 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('rejects files that are too small', () => {
      const buffer = Buffer.from([0x89, 0x50]);
      const result = service.validateImageMagicBytes(buffer, 'image/png');
      expect(result.valid).toBe(false);
    });
  });
});
