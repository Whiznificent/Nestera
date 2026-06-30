import { Module } from '@nestjs/common';
import { QueryLoggerService } from './query-logger.service';
import { PerformanceController } from './performance.controller';
import { CompressionMetricsService } from '../../common/services/compression-metrics.service';
import { ConnectionPoolModule } from '../../common/database/connection-pool.module';

@Module({
  imports: [ConnectionPoolModule],
  providers: [QueryLoggerService, CompressionMetricsService],
  controllers: [PerformanceController],
  exports: [QueryLoggerService],
})
export class PerformanceModule {}
