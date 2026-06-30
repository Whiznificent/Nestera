import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AvatarUploadService } from './avatar-upload.service';
import {
  AvatarUpload,
  AvatarProcessingStatus,
} from './entities/avatar-upload.entity';
import { StorageService } from '../storage/storage.service';
import { FileUploadConfigService } from '../storage/file-upload-config.service';
import { JobQueueService } from '../job-queue/job-queue.service';

describe('AvatarUploadService', () => {
  let service: AvatarUploadService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  const mockStorageService = {
    saveFile: jest.fn().mockResolvedValue('/uploads/avatars/raw/test.png'),
  };

  const mockFileUploadConfig = {
    validateFile: jest.fn().mockResolvedValue({ valid: true }),
  };

  const mockJobQueueService = {
    addAvatarProcessingJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  };

  const mockFile = {
    originalname: 'avatar.png',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarUploadService,
        { provide: getRepositoryToken(AvatarUpload), useValue: mockRepository },
        { provide: StorageService, useValue: mockStorageService },
        { provide: FileUploadConfigService, useValue: mockFileUploadConfig },
        { provide: JobQueueService, useValue: mockJobQueueService },
      ],
    }).compile();

    service = module.get<AvatarUploadService>(AvatarUploadService);
  });

  it('should enqueue avatar processing after validation', async () => {
    const savedUpload = {
      id: 'upload-1',
      userId: 'user-1',
      originalFilename: 'avatar.png',
      storagePath: '/uploads/avatars/raw/test.png',
      mimeType: 'image/png',
      fileSize: 1024,
      processingStatus: AvatarProcessingStatus.PENDING,
      jobId: null,
      createdAt: new Date(),
    };

    mockRepository.create.mockReturnValue(savedUpload);
    mockRepository.save.mockResolvedValue(savedUpload);

    const result = await service.uploadAvatar('user-1', mockFile);

    expect(mockFileUploadConfig.validateFile).toHaveBeenCalledWith(
      mockFile,
      'avatar',
    );
    expect(mockStorageService.saveFile).toHaveBeenCalledWith(
      mockFile,
      'avatars/raw',
    );
    expect(mockJobQueueService.addAvatarProcessingJob).toHaveBeenCalled();
    expect(mockRepository.update).toHaveBeenCalledWith('upload-1', {
      jobId: 'job-123',
    });
    expect(result.processingStatus).toBe(AvatarProcessingStatus.PENDING);
    expect(result.jobId).toBe('job-123');
  });

  it('should reject invalid files', async () => {
    mockFileUploadConfig.validateFile.mockResolvedValue({
      valid: false,
      error: 'Invalid file type',
    });

    await expect(service.uploadAvatar('user-1', mockFile)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should return upload status by id', async () => {
    const upload = {
      id: 'upload-1',
      userId: 'user-1',
      processingStatus: AvatarProcessingStatus.COMPLETED,
      jobId: 'job-123',
      processedUrl: '/uploads/avatars/processed/abc.webp',
      processingError: null,
      createdAt: new Date(),
    };
    mockRepository.findOne.mockResolvedValue(upload);

    const result = await service.getUploadStatus('user-1', 'upload-1');
    expect(result.processedUrl).toBe('/uploads/avatars/processed/abc.webp');
  });
});
