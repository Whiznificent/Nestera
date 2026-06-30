import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as archiver from 'archiver';
import {
  DataExportRequest,
  ExportStatus,
} from './entities/data-export-request.entity';
import { User } from '../user/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SavingsGoal } from '../savings/entities/savings-goal.entity';
import { MailService } from '../mail/mail.service';

export const EXPORT_DIR = path.join(os.tmpdir(), 'nestera-exports');
export const LINK_EXPIRY_DAYS = 7;

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    @InjectRepository(DataExportRequest)
    private readonly exportRepository: Repository<DataExportRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(SavingsGoal)
    private readonly savingsGoalRepository: Repository<SavingsGoal>,
    private readonly mailService: MailService,
  ) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create an export request and trigger async processing.
   */
  async requestExport(
    userId: string,
  ): Promise<{ requestId: string; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const request = this.exportRepository.create({
      userId,
      status: ExportStatus.PENDING,
    });
    const saved = await this.exportRepository.save(request);

    this.logger.log(
      `Data export requested for user ${userId}, request ${saved.id}`,
    );

    // Trigger async processing (fire-and-forget)
    this.processExport(saved.id, user).catch((err) =>
      this.logger.error(`Export ${saved.id} failed`, err),
    );

    return {
      requestId: saved.id,
      message:
        'Export request received. You will receive an email when your data is ready.',
    };
  }

  /**
   * Download a ready export by token.
   *
   * Enforces:
   *  - TTL: rejects if `expiresAt` is in the past.
   *  - Checksum: rejects if the file on disk no longer matches the stored SHA-256.
   */
  async getExportFile(
    token: string,
  ): Promise<{ filePath: string; userId: string }> {
    const request = await this.exportRepository.findOne({ where: { token } });

    if (!request || request.status === ExportStatus.PENDING || request.status === ExportStatus.PROCESSING) {
      throw new NotFoundException('Export not found or not ready');
    }

    // TTL check — mark as expired if needed
    if (request.expiresAt && request.expiresAt < new Date()) {
      if (request.status !== ExportStatus.EXPIRED) {
        await this.exportRepository.update(request.id, {
          status: ExportStatus.EXPIRED,
        });
      }
      throw new BadRequestException('Export link has expired');
    }

    if (request.status !== ExportStatus.READY) {
      throw new NotFoundException('Export not found or not ready');
    }

    if (!request.filePath || !fs.existsSync(request.filePath)) {
      throw new NotFoundException('Export file not found');
    }

    // Integrity check — verify SHA-256 checksum
    if (request.checksum) {
      const onDiskChecksum = computeFileChecksum(request.filePath);
      if (onDiskChecksum !== request.checksum) {
        this.logger.error(
          `Checksum mismatch for export ${request.id}: ` +
            `stored=${request.checksum} onDisk=${onDiskChecksum}`,
        );
        throw new InternalServerErrorException(
          'Export artifact integrity check failed',
        );
      }
    }

    return { filePath: request.filePath, userId: request.userId };
  }

  /**
   * Get export request status (includes checksum for audit purposes).
   */
  async getExportStatus(requestId: string, userId: string) {
    const request = await this.exportRepository.findOne({
      where: { id: requestId, userId },
    });
    if (!request) throw new NotFoundException('Export request not found');
    return {
      requestId: request.id,
      status: request.status,
      createdAt: request.createdAt,
      completedAt: request.completedAt,
      expiresAt: request.expiresAt,
      checksum: request.checksum ?? undefined,
      fileSize: request.fileSize ? Number(request.fileSize) : undefined,
    };
  }

  // ── Scheduled cleanup ──────────────────────────────────────────────────────

  /**
   * Purge expired export records and their files.
   * Runs daily at 04:00 UTC to avoid conflict with backup crons (02:00 / 03:00).
   */
  @Cron('0 4 * * *')
  async purgeExpiredExports(): Promise<void> {
    const now = new Date();
    const expired = await this.exportRepository.find({
      where: { expiresAt: LessThan(now), status: ExportStatus.READY },
    });

    for (const record of expired) {
      try {
        if (record.filePath && fs.existsSync(record.filePath)) {
          fs.unlinkSync(record.filePath);
          this.logger.log(`Deleted expired export file: ${record.filePath}`);
        }
        await this.exportRepository.update(record.id, {
          status: ExportStatus.EXPIRED,
          filePath: null,
        });
      } catch (err) {
        this.logger.error(
          `Failed to purge export ${record.id}: ${(err as Error).message}`,
        );
      }
    }

    if (expired.length > 0) {
      this.logger.log(`Purged ${expired.length} expired export(s)`);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Async: build ZIP, compute checksum, update record, email user.
   */
  private async processExport(requestId: string, user: User): Promise<void> {
    await this.exportRepository.update(requestId, {
      status: ExportStatus.PROCESSING,
    });

    try {
      const [transactions, notifications, goals] = await Promise.all([
        this.transactionRepository.find({ where: { userId: user.id } }),
        this.notificationRepository.find({ where: { userId: user.id } }),
        this.savingsGoalRepository.find({ where: { userId: user.id } }),
      ]);

      const zipPath = path.join(EXPORT_DIR, `${requestId}.zip`);
      await this.buildZip(zipPath, {
        'profile.json': {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        'transactions.json': transactions,
        'goals.json': goals,
        'notifications.json': notifications,
      });

      // Compute SHA-256 checksum of the final artifact
      const checksum = computeFileChecksum(zipPath);
      const fileSize = fs.statSync(zipPath).size;

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + LINK_EXPIRY_DAYS * 86_400_000);

      await this.exportRepository.update(requestId, {
        status: ExportStatus.READY,
        token,
        filePath: zipPath,
        expiresAt,
        completedAt: new Date(),
        checksum,
        fileSize,
      });

      // Email the download link
      const downloadUrl = `/users/data/export/download/${token}`;
      await this.mailService.sendRawMail(
        user.email,
        'Your Nestera data export is ready',
        `Hi ${user.name || 'there'},\n\nYour data export is ready. Download it here:\n${downloadUrl}\n\nThis link expires in ${LINK_EXPIRY_DAYS} days.\n\nNestera Team`,
      );

      this.logger.log(
        `Export ${requestId} completed for user ${user.id} ` +
          `(checksum=${checksum}, size=${fileSize}B)`,
      );
    } catch (err) {
      await this.exportRepository.update(requestId, {
        status: ExportStatus.FAILED,
      });
      throw err;
    }
  }

  private buildZip(
    outputPath: string,
    files: Record<string, unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      for (const [name, data] of Object.entries(files)) {
        archive.append(JSON.stringify(data, null, 2), { name });
      }

      archive.finalize();
    });
  }
}

// ── Standalone utility ─────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hex digest of the file at `filePath`.
 * Synchronous — suitable for small-to-medium export files.
 */
export function computeFileChecksum(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}
