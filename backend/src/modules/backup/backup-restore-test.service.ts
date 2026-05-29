import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { BackupRecord, BackupStatus } from './entities/backup-record.entity';
import { BackupService } from './backup.service';

const execAsync = promisify(exec);

@Injectable()
export class BackupRestoreTestService {
  private readonly logger = new Logger(BackupRestoreTestService.name);
  private readonly s3: S3Client;
  private readonly encryptionKey: Buffer;
  private readonly tmpDir: string;
  private readonly testDbName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly backupService: BackupService,
    @InjectRepository(BackupRecord)
    private readonly backupRepo: Repository<BackupRecord>,
  ) {
    this.encryptionKey = Buffer.from(
      this.config.get<string>('backup.encryptionKey')!,
      'hex',
    );
    this.tmpDir = this.config.get<string>('backup.tmpDir') ?? '/tmp';
    this.testDbName =
      this.config.get<string>('backup.testDb.name') || 'nestera_restore_test';

    this.s3 = new S3Client({
      region: this.config.get<string>('backup.s3Region') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('backup.awsAccessKeyId')!,
        secretAccessKey: this.config.get<string>('backup.awsSecretAccessKey')!,
      },
    });
  }

  // First Sunday of every month at 04:00 UTC
  @Cron('0 4 1-7 * 0')
  async runMonthlyRestoreTest(): Promise<void> {
    this.logger.log('Starting monthly restore test...');
    const latest = await this.backupService.getLastSuccessful();
    if (!latest) {
      this.logger.error('No successful backup found for restore test.');
      return;
    }
    await this.testRestore(latest);
  }

  async testRestore(record: BackupRecord): Promise<boolean> {
    const encFile = path.join(this.tmpDir, record.filename);
    const dumpFile = encFile.replace('.enc', '');
    let passed = false;

    try {
      await this.downloadFromS3(record.s3Key, encFile);
      await this.decrypt(encFile, dumpFile);
      fs.unlinkSync(encFile);

      const adminUrl = this.buildAdminUrl();
      await execAsync(
        `psql "${adminUrl}" -c "DROP DATABASE IF EXISTS ${this.testDbName}"`,
      );
      await execAsync(
        `psql "${adminUrl}" -c "CREATE DATABASE ${this.testDbName}"`,
      );

      const testUrl = this.buildTestDbUrl();
      await execAsync(`pg_restore --no-password -d "${testUrl}" "${dumpFile}"`);

      // Validate: check at least one table exists
      const { stdout } = await execAsync(
        `psql "${testUrl}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"`,
      );
      const tableCount = parseInt(stdout.trim(), 10);
      passed = tableCount > 0;

      await execAsync(
        `psql "${adminUrl}" -c "DROP DATABASE IF EXISTS ${this.testDbName}"`,
      );

      record.status = passed
        ? BackupStatus.RESTORE_TEST_PASSED
        : BackupStatus.RESTORE_TEST_FAILED;

      this.logger.log(
        `Restore test ${passed ? 'PASSED' : 'FAILED'} — ${tableCount} tables found`,
      );
    } catch (err) {
      record.status = BackupStatus.RESTORE_TEST_FAILED;
      record.errorMessage = (err as Error).message;
      this.logger.error(`Restore test failed: ${record.errorMessage}`);
    } finally {
      try {
        if (fs.existsSync(dumpFile)) fs.unlinkSync(dumpFile);
      } catch (_) {
        /* best-effort */
      }
    }

    await this.backupRepo.save(record);
    return passed;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async downloadFromS3(key: string, destPath: string): Promise<void> {
    const bucket = this.config.get<string>('backup.s3Bucket')!;
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const stream = response.Body as Readable;
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      stream.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
  }

  private async decrypt(inputFile: string, outputFile: string): Promise<void> {
    const iv = Buffer.alloc(16);
    const fd = fs.openSync(inputFile, 'r');
    fs.readSync(fd, iv, 0, 16, 0);
    fs.closeSync(fd);

    const input = fs.createReadStream(inputFile, { start: 16 });
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.encryptionKey,
      iv,
    );
    const output = fs.createWriteStream(outputFile);

    await new Promise<void>((resolve, reject) => {
      input.pipe(decipher).pipe(output);
      output.on('finish', resolve);
      output.on('error', reject);
      input.on('error', reject);
    });
  }

  private buildAdminUrl(): string {
    const url = this.config.get<string>('database.url');
    if (url) return url.replace(/\/[^/]+$/, '/postgres');
    return `postgresql://${this.config.get('database.user')}:${this.config.get('database.pass')}@${this.config.get('database.host')}:${this.config.get('database.port')}/postgres`;
  }

  private buildTestDbUrl(): string {
    const url = this.config.get<string>('database.url');
    if (url) return url.replace(/\/[^/]+$/, `/${this.testDbName}`);
    return `postgresql://${this.config.get('database.user')}:${this.config.get('database.pass')}@${this.config.get('database.host')}:${this.config.get('database.port')}/${this.testDbName}`;
  }
}
