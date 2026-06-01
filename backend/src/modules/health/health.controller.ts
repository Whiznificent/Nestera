import { Controller, Get, HttpCode, HttpStatus, Query, Header, Logger } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TypeOrmHealthIndicator } from './indicators/typeorm.health';
import { IndexerHealthIndicator } from './indicators/indexer.health';
import { RpcHealthIndicator } from './indicators/rpc.health';
import { ConnectionPoolHealthIndicator } from './indicators/connection-pool.health';
import { SystemHealthIndicator } from './indicators/system.health';
import {
  RedisHealthIndicator,
  EmailServiceHealthIndicator,
  SorobanRpcHealthIndicator,
  HorizonHealthIndicator,
} from './indicators/external-services.health';
import { HealthHistoryService } from './health-history.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly indexer: IndexerHealthIndicator,
    private readonly rpc: RpcHealthIndicator,
    private readonly connectionPool: ConnectionPoolHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly email: EmailServiceHealthIndicator,
    private readonly sorobanRpc: SorobanRpcHealthIndicator,
    private readonly horizon: HorizonHealthIndicator,
    private readonly system: SystemHealthIndicator,
    private readonly healthHistory: HealthHistoryService,
  ) {}

  @Get()
  @HealthCheck()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Full application health check',
    description:
      'Comprehensive health check including database, RPC endpoints, indexer service, and connection pool',
  })
  async check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.connectionPool.isHealthy(),
      () => this.rpc.isHealthy('rpc'),
      () => this.indexer.isHealthy('indexer'),
    ]);
  }

  @Get('detailed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detailed health check for all external dependencies',
    description: 'Check status of all external services with response times',
  })
  async detailed() {
    const startTime = Date.now();
    const checks = await Promise.allSettled([
      this.db.isHealthy('database'),
      this.rpc.isHealthy('rpc'),
      this.indexer.isHealthy('indexer'),
      this.redis.isHealthy('redis'),
      this.email.isHealthy('email'),
      this.sorobanRpc.isHealthy('soroban-rpc'),
      this.horizon.isHealthy('horizon'),
      this.system.isHealthy('system'),
    ]);

    const services = [
      'database',
      'rpc',
      'indexer',
      'redis',
      'email',
      'soroban-rpc',
      'horizon',
      'system',
    ];

    const results = checks.map((check, index) => {
      const serviceName = services[index];
      let status: 'up' | 'down' | 'degraded' = 'down';
      let responseTime = 0;
      let details: any = {};

      if (check.status === 'fulfilled') {
        const val = check.value;
        const res = val[serviceName];
        status = res?.status === 'up' || res?.status === 'healthy' || res?.status !== 'down' ? 'up' : 'down';
        responseTime = parseInt(res?.responseTime || '0', 10) || 0;
        details = res;
      } else {
        const errMessage = check.reason?.message || 'Unknown error';
        details = { status: 'down', error: errMessage };
        this.logger.error(`[ALERT] Health check failure: service ${serviceName} is DOWN! Error: ${errMessage}`);
      }

      this.healthHistory.recordCheck({
        service: serviceName,
        status,
        responseTime,
        timestamp: new Date(),
        error: status === 'down' ? JSON.stringify(details) : undefined,
      });

      return { [serviceName]: details };
    });

    const totalTime = Date.now() - startTime;
    const allHealthy = checks.every((c) => c.status === 'fulfilled' && (c.value as any)[Object.keys(c.value)[0]]?.status !== 'down');

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${totalTime}ms`,
      checks: Object.assign({}, ...results),
    };
  }

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Simple endpoint for Kubernetes liveness probes',
  })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  @HealthCheck()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Readiness check for Kubernetes - validates critical dependencies',
  })
  async ready() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.connectionPool.isHealthy(),
      () => this.rpc.isHealthy('rpc'),
    ]);
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get health check history',
    description: 'Retrieve historical health check data',
  })
  getHistory(
    @Query('service') service?: string,
    @Query('limit') limit: number = 100,
  ) {
    return {
      history: this.healthHistory.getHistory(service, limit),
    };
  }

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get health statistics',
    description: 'Get uptime and performance statistics for all services',
  })
  getStats() {
    return this.healthHistory.getAllStats();
  }

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/html')
  @ApiOperation({
    summary: 'Get health dashboard UI',
    description: 'Renders a beautiful premium HTML/CSS dashboard of service health status',
  })
  async getDashboard() {
    const detailed = await this.detailed();
    const stats = this.healthHistory.getAllStats();
    
    // Compute some metrics for System Health indicator
    const systemInfo = detailed.checks.system || {};
    const processMem = systemInfo.processMemory || { rss: '0 MB', heapUsed: '0 MB' };
    const sysMem = systemInfo.systemMemory || { total: '0 GB', free: '0 GB', utilizationPercentage: '0%' };
    const cpuInfo = systemInfo.cpu || { loadAverage1m: '0.00', cores: 1 };

    const services = Object.keys(detailed.checks).filter(s => s !== 'system');
    
    const serviceCards = services.map(name => {
      const check = detailed.checks[name] || {};
      const isUp = check.status === 'up' || check.status === 'healthy' || (check.status !== 'down' && !check.error);
      const resTime = check.responseTime || 'N/A';
      const svcStats = stats[name] || { uptime: '100%', avgResponseTime: '0ms' };
      const statusClass = isUp ? 'status-ok' : 'status-err';
      const badge = isUp ? 'UP' : 'DOWN';
      
      let extraDetails = '';
      if (!isUp) {
        extraDetails = `<div class="error-msg">${check.error || check.message || 'Unknown connection error'}</div>`;
      } else {
        extraDetails = `<div class="details">Resp Time: ${resTime} | Uptime: ${svcStats.uptime}</div>`;
      }

      return `
        <div class="card">
          <div class="card-header">
            <span class="service-name">${name.toUpperCase().replace('-', ' ')}</span>
            <span class="status-badge ${statusClass}">${badge}</span>
          </div>
          <div class="card-body">
            <div class="stat-row">
              <span class="label">Avg response:</span>
              <span class="val">${svcStats.avgResponseTime || resTime}</span>
            </div>
            ${extraDetails}
          </div>
        </div>
      `;
    }).join('');

    const overallStatus = detailed.status === 'ok' ? 'ALL SYSTEMS OPERATIONAL' : 'DEGRADED PERFORMANCE';
    const overallClass = detailed.status === 'ok' ? 'status-ok' : 'status-err';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nestera Systems Health</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(17, 24, 39, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --green-glow: 0 0 20px rgba(16, 185, 129, 0.4);
            --red-glow: 0 0 20px rgba(239, 68, 68, 0.4);
            --color-up: #10b981;
            --color-down: #ef4444;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .container {
            max-width: 1200px;
            width: 100%;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1.5rem;
          }
          .title-section h1 {
            font-size: 2.2rem;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, #3b82f6, #10b981);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .title-section p {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-top: 0.25rem;
          }
          .overall-status {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1.25rem;
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px solid var(--border-color);
          }
          .pulse-beacon {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
          }
          .pulse-beacon.status-ok {
            background-color: var(--color-up);
            box-shadow: var(--green-glow);
            animation: pulse-green 2s infinite;
          }
          .pulse-beacon.status-err {
            background-color: var(--color-down);
            box-shadow: var(--red-glow);
            animation: pulse-red 2s infinite;
          }
          @keyframes pulse-green {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          @keyframes pulse-red {
            0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          }
          .status-label {
            font-weight: 600;
            font-size: 0.95rem;
            letter-spacing: 0.5px;
          }
          .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
          }
          .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.5rem;
            transition: all 0.3s ease;
          }
          .card:hover {
            transform: translateY(-4px);
            border-color: rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
          }
          .service-name {
            font-weight: 600;
            font-size: 1.1rem;
            color: var(--text-main);
          }
          .status-badge {
            padding: 0.25rem 0.6rem;
            font-size: 0.75rem;
            font-weight: 800;
            border-radius: 6px;
          }
          .status-badge.status-ok {
            background: rgba(16, 185, 129, 0.15);
            color: var(--color-up);
            border: 1px solid rgba(16, 185, 129, 0.3);
          }
          .status-badge.status-err {
            background: rgba(239, 68, 68, 0.15);
            color: var(--color-down);
            border: 1px solid rgba(239, 68, 68, 0.3);
          }
          .stat-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
          }
          .stat-row .label {
            color: var(--text-muted);
          }
          .stat-row .val {
            font-weight: 600;
          }
          .details {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 0.75rem;
            border-top: 1px solid var(--border-color);
            padding-top: 0.5rem;
          }
          .error-msg {
            font-size: 0.8rem;
            color: var(--color-down);
            margin-top: 0.75rem;
            border-top: 1px solid rgba(239, 68, 68, 0.2);
            padding-top: 0.5rem;
            word-break: break-all;
          }
          .system-health-section {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            padding: 2rem;
            margin-top: 1rem;
          }
          .system-health-header {
            font-size: 1.4rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            color: var(--text-main);
          }
          .system-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
          }
          .system-metric-box {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.25rem;
          }
          .system-metric-title {
            color: var(--text-muted);
            font-size: 0.85rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.5px;
          }
          .system-metric-val {
            font-size: 1.4rem;
            font-weight: 800;
            color: #3b82f6;
          }
          .system-sub-metric {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 0.25rem;
          }
          .footer {
            margin-top: 3rem;
            text-align: center;
            color: var(--text-muted);
            font-size: 0.8rem;
          }
        </style>
        <script>
          // Auto refresh page every 10 seconds
          setTimeout(() => {
            window.location.reload();
          }, 10000);
        </script>
      </head>
      <body>
        <div class="container">
          <header>
            <div class="title-section">
              <h1>Nestera Health Dashboard</h1>
              <p>Last checked: ${new Date(detailed.timestamp).toLocaleString()} | Refreshes automatically</p>
            </div>
            <div class="overall-status">
              <span class="pulse-beacon ${overallClass}"></span>
              <span class="status-label" style="color: ${detailed.status === 'ok' ? 'var(--color-up)' : 'var(--color-down)'}">${overallStatus}</span>
            </div>
          </header>

          <div class="dashboard-grid">
            ${serviceCards}
          </div>

          <div class="system-health-section">
            <h2 class="system-health-header">System & Resource Metrics</h2>
            <div class="system-grid">
              <div class="system-metric-box">
                <div class="system-metric-title">PROCESS MEMORY (RSS)</div>
                <div class="system-metric-val">${processMem.rss}</div>
                <div class="system-sub-metric">Heap Used: ${processMem.heapUsed}</div>
              </div>
              <div class="system-metric-box">
                <div class="system-metric-title">SYSTEM MEMORY UTILIZATION</div>
                <div class="system-metric-val">${sysMem.utilizationPercentage}</div>
                <div class="system-sub-metric">Free: ${sysMem.free} / Total: ${sysMem.total}</div>
              </div>
              <div class="system-metric-box">
                <div class="system-metric-title">CPU LOAD AVERAGE (1M)</div>
                <div class="system-metric-val">${cpuInfo.loadAverage1m}</div>
                <div class="system-sub-metric">Cores: ${cpuInfo.cores}</div>
              </div>
              <div class="system-metric-box">
                <div class="system-metric-title">PROCESS UPTIME</div>
                <div class="system-metric-val">${systemInfo.uptime || 'N/A'}</div>
                <div class="system-sub-metric">Response: ${detailed.responseTime}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            Nestera Services Monitor • Platform Version 2.0
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
