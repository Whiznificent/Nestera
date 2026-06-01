import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  lastCheck: Date;
  error?: string;
}

import * as net from 'net';
import { URL } from 'url';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      return this.getStatus(key, false, {
        message: 'Redis not configured',
      });
    }

    const startTime = Date.now();
    return new Promise<HealthIndicatorResult>((resolve) => {
      let host = 'localhost';
      let port = 6379;

      try {
        const parsed = new URL(redisUrl);
        host = parsed.hostname || 'localhost';
        port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      } catch (e) {
        const match = redisUrl.match(/(?:redis:\/\/)?([^:/]+)(?::(\d+))?/);
        if (match) {
          host = match[1];
          port = match[2] ? parseInt(match[2], 10) : 6379;
        }
      }

      const socket = new net.Socket();
      socket.setTimeout(3000);

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.connect(port, host, () => {
        socket.write('PING\r\n');
      });

      socket.on('data', (data) => {
        cleanup();
        const duration = Date.now() - startTime;
        resolve(
          this.getStatus(key, true, {
            responseTime: `${duration}ms`,
          })
        );
      });

      socket.on('error', (err) => {
        cleanup();
        const duration = Date.now() - startTime;
        this.logger.error(`Redis health check failed to connect: ${err.message}`);
        resolve(
          this.getStatus(key, false, {
            responseTime: `${duration}ms`,
            error: err.message,
          })
        );
      });

      socket.on('timeout', () => {
        cleanup();
        const duration = Date.now() - startTime;
        this.logger.error('Redis health check timed out');
        resolve(
          this.getStatus(key, false, {
            responseTime: `${duration}ms`,
            error: 'Connection timeout',
          })
        );
      });
    });
  }
}

@Injectable()
export class EmailServiceHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(EmailServiceHealthIndicator.name);

  constructor(private configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const mailHost = this.configService.get<string>('MAIL_HOST');

    if (!mailHost) {
      return this.getStatus(key, false, {
        message: 'Email service not configured',
      });
    }

    const startTime = Date.now();
    try {
      // Test SMTP connection
      const response = await axios.get(`http://${mailHost}:25`, {
        timeout: 5000,
      });
      const responseTime = Date.now() - startTime;

      return this.getStatus(key, true, {
        responseTime: `${responseTime}ms`,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.warn(`Email service health check failed: ${error}`);

      return this.getStatus(key, false, {
        responseTime: `${responseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

@Injectable()
export class SorobanRpcHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(SorobanRpcHealthIndicator.name);

  constructor(private configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const rpcUrl = this.configService.get<string>('SOROBAN_RPC_URL');

    if (!rpcUrl) {
      return this.getStatus(key, false, {
        message: 'Soroban RPC not configured',
      });
    }

    const startTime = Date.now();
    try {
      const response = await axios.post(
        rpcUrl,
        { jsonrpc: '2.0', method: 'getHealth', params: [], id: 1 },
        { timeout: 10000 },
      );

      const responseTime = Date.now() - startTime;
      const isHealthy = response.data?.result?.status === 'healthy';

      return this.getStatus(key, isHealthy, {
        responseTime: `${responseTime}ms`,
        status: response.data?.result?.status,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`Soroban RPC health check failed: ${error}`);

      return this.getStatus(key, false, {
        responseTime: `${responseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

@Injectable()
export class HorizonHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(HorizonHealthIndicator.name);

  constructor(private configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const horizonUrl = this.configService.get<string>('HORIZON_URL');

    if (!horizonUrl) {
      return this.getStatus(key, false, {
        message: 'Horizon not configured',
      });
    }

    const startTime = Date.now();
    try {
      const response = await axios.get(`${horizonUrl}/health`, {
        timeout: 10000,
      });
      const responseTime = Date.now() - startTime;

      return this.getStatus(key, true, {
        responseTime: `${responseTime}ms`,
      });
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`Horizon health check failed: ${error}`);

      return this.getStatus(key, false, {
        responseTime: `${responseTime}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
