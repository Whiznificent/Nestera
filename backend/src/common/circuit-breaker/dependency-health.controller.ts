import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExternalCallService } from './external-call.service';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

@ApiTags('Admin - Dependencies')
@ApiBearerAuth()
@Controller('admin/dependencies')
@Roles(Role.ADMIN)
export class DependencyHealthController {
  constructor(private readonly externalCallService: ExternalCallService) {}

  @Get('health')
  @ApiOperation({ summary: 'Get health status of all external dependencies' })
  getHealth() {
    return {
      success: true,
      data: this.externalCallService.getDependencyHealth(),
    };
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Get recent call metrics for external dependencies',
  })
  getMetrics(@Query('dependency') dependency?: string) {
    const metrics = this.externalCallService.getMetrics(dependency);
    return {
      success: true,
      data: {
        count: metrics.length,
        metrics: metrics.slice(-50),
      },
    };
  }
}
