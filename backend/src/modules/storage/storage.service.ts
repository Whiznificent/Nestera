import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { StorageAccessService } from './storage-access.service';

@Injectable()
export class StorageService {
  constructor(private readonly storageAccess: StorageAccessService) {}

  toStorageKey(storagePath: string): string {
    return storagePath.startsWith('/uploads/')
      ? storagePath.slice('/uploads/'.length)
      : storagePath;
  }

  readFileBuffer(storagePath: string): Buffer {
    return this.storageAccess.readLocalFile(this.toStorageKey(storagePath));
  }

  async saveFile(
    file: { originalname: string; buffer: Buffer; mimetype: string },
    ownerIdOrPrefix?: string,
  ): Promise<string> {
    try {
      const keyPrefix =
        ownerIdOrPrefix?.includes('/') === true ? ownerIdOrPrefix : 'files';
      const ownerId =
        ownerIdOrPrefix && !ownerIdOrPrefix.includes('/')
          ? ownerIdOrPrefix
          : undefined;
      const fileExtension = extname(file.originalname);
      const key = `${keyPrefix}/${randomUUID()}${fileExtension}`;

      const stored = await this.storageAccess.getProvider().save(file.buffer, {
        key,
        contentType: file.mimetype,
        ownerId,
        visibility: 'private',
      });

      if (ownerId) {
        this.storageAccess.registerAccessRule({
          key,
          ownerId,
          visibility: 'private',
        });
      }

      return stored.path;
    } catch {
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  async saveBuffer(
    buffer: Buffer,
    pathTemplate: string,
    contentType = 'image/webp',
  ): Promise<string> {
    try {
      const ext = extname(pathTemplate);
      const keyPrefix = pathTemplate.includes('/')
        ? pathTemplate.split('/').slice(0, -1).join('/')
        : 'files';
      const key = `${keyPrefix}/${randomUUID()}${ext}`;

      const stored = await this.storageAccess.getProvider().save(buffer, {
        key,
        contentType,
        visibility: 'private',
      });

      return stored.path;
    } catch {
      throw new InternalServerErrorException('Failed to save file');
    }
  }

  async getSignedDownloadUrl(
    key: string,
    requesterId: string,
    isAdmin = false,
  ): Promise<string> {
    return this.storageAccess.getSignedDownloadUrl(key, requesterId, isAdmin);
  }

  async getSignedUploadUrl(
    originalName: string,
    ownerId: string,
    contentType: string,
  ) {
    return this.storageAccess.getSignedUploadUrl(
      originalName,
      ownerId,
      contentType,
    );
  }

  async deleteFile(keyOrPath: string): Promise<void> {
    await this.storageAccess.getProvider().delete(this.toStorageKey(keyOrPath));
  }
}
