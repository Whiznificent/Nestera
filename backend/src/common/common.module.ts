import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PiiEncryptionService } from './services/pii-encryption.service';
import { RateLimitMonitorService } from './services/rate-limit-monitor.service';
import { AuditLogService } from './services/audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [RateLimitMonitorService, PiiEncryptionService, AuditLogService],
  exports: [RateLimitMonitorService, PiiEncryptionService, AuditLogService],
})
export class CommonModule {}
