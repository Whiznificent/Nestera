import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Define File type for multer uploads
interface File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

/**
 * Configuration for file uploads across the application
 * Handles multer setup, size limits, and virus scanning
 */
@Injectable()
export class FileUploadConfigService {
  readonly defaultMaxSize: number;
  readonly maxAvatarSize: number;
  readonly maxDocumentSize: number;
  readonly maxBackupRestoreSize: number;
  readonly allowedImageTypes: string[];
  readonly allowedDocumentTypes: string[];
  readonly allowedBackupTypes: string[];
  readonly virusScanningEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.defaultMaxSize =
      this.configService.get<number>('upload.defaultMaxSize') ||
      10 * 1024 * 1024; // 10MB
    this.maxAvatarSize =
      this.configService.get<number>('upload.maxAvatarSize') || 5 * 1024 * 1024; // 5MB
    this.maxDocumentSize =
      this.configService.get<number>('upload.maxDocumentSize') ||
      10 * 1024 * 1024; // 10MB
    this.maxBackupRestoreSize =
      this.configService.get<number>('upload.maxBackupRestoreSize') ||
      1024 * 1024 * 1024; // 1GB
    this.allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    this.allowedDocumentTypes = ['application/pdf', 'image/jpeg'];
    this.allowedBackupTypes = ['application/octet-stream', 'application/gzip'];
    this.virusScanningEnabled =
      this.configService.get<boolean>('upload.virusScanningEnabled') ?? false;
  }

  /**
   * Get multer options for Express/NestJS file uploads
   */
  getMulterOptions(fileType: 'avatar' | 'document' | 'backup' | 'default') {
    let limits = { fileSize: this.defaultMaxSize };

    switch (fileType) {
      case 'avatar':
        limits = { fileSize: this.maxAvatarSize };
        break;
      case 'document':
        limits = { fileSize: this.maxDocumentSize };
        break;
      case 'backup':
        limits = { fileSize: this.maxBackupRestoreSize };
        break;
    }

    return {
      limits,
      fileFilter: this.createFileFilter(fileType),
    };
  }

  /**
   * Create a file filter function for multer
   */
  private createFileFilter(
    fileType: 'avatar' | 'document' | 'backup' | 'default',
  ) {
    return (_req: any, file: any, cb: any) => {
      const allowedTypes = this.getAllowedTypesForFileType(fileType);

      if (allowedTypes.length === 0 || allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
          ),
        );
      }
    };
  }

  /**
   * Get allowed MIME types for a file type
   */
  private getAllowedTypesForFileType(
    fileType: 'avatar' | 'document' | 'backup' | 'default',
  ): string[] {
    switch (fileType) {
      case 'avatar':
        return this.allowedImageTypes;
      case 'document':
        return this.allowedDocumentTypes;
      case 'backup':
        return this.allowedBackupTypes;
      default:
        return [];
    }
  }

  /**
   * Validate file before processing
   */
  async validateFile(
    file: File,
    fileType: 'avatar' | 'document' | 'backup' | 'default',
  ): Promise<{ valid: boolean; error?: string }> {
    // Check file size
    const maxSize = this.getMaxSizeForFileType(fileType);
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds limit of ${maxSize / 1024 / 1024}MB`,
      };
    }

    // Check MIME type
    const allowedTypes = this.getAllowedTypesForFileType(fileType);
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: `Invalid file type: ${file.mimetype}`,
      };
    }

    // Magic-byte validation for images
    if (fileType === 'avatar' && file.buffer) {
      const magicResult = this.validateImageMagicBytes(
        file.buffer,
        file.mimetype,
      );
      if (!magicResult.valid) {
        return magicResult;
      }
    }

    // Virus scanning (if enabled)
    if (this.virusScanningEnabled) {
      try {
        const isClean = await this.scanForViruses(file);
        if (!isClean) {
          return {
            valid: false,
            error: 'File failed virus scan',
          };
        }
      } catch (error) {
        return {
          valid: false,
          error: `Virus scan failed: ${(error as Error).message}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate image content via magic bytes (not just MIME header).
   */
  validateImageMagicBytes(
    buffer: Buffer,
    mimetype: string,
  ): { valid: boolean; error?: string } {
    if (!buffer || buffer.length < 4) {
      return { valid: false, error: 'File is too small to be a valid image' };
    }

    const isJpeg =
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isWebp =
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    const matchesMime =
      (mimetype === 'image/jpeg' && isJpeg) ||
      (mimetype === 'image/png' && isPng) ||
      (mimetype === 'image/webp' && isWebp);

    if (!matchesMime) {
      return {
        valid: false,
        error: 'File content does not match declared image type',
      };
    }

    return { valid: true };
  }

  /**
   * Scan file for viruses using ClamAV or similar service
   * Placeholder implementation - integrate with actual virus scanner
   */
  private async scanForViruses(_file: File): Promise<boolean> {
    // TODO: Integrate with ClamAV or VirusTotal API
    // For now, always return true (file is clean)
    return true;
  }

  /**
   * Get max size for file type
   */
  private getMaxSizeForFileType(
    fileType: 'avatar' | 'document' | 'backup' | 'default',
  ): number {
    switch (fileType) {
      case 'avatar':
        return this.maxAvatarSize;
      case 'document':
        return this.maxDocumentSize;
      case 'backup':
        return this.maxBackupRestoreSize;
      default:
        return this.defaultMaxSize;
    }
  }
}
