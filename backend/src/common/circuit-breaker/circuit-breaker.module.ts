import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ExternalCallService } from './external-call.service';
import { DependencyHealthController } from './dependency-health.controller';

@Module({
  controllers: [DependencyHealthController],
  providers: [CircuitBreakerService, ExternalCallService],
  exports: [CircuitBreakerService, ExternalCallService],
})
export class CircuitBreakerModule {}
