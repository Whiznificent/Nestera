import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import * as helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  VersioningMiddleware,
  CURRENT_VERSION,
  DEPRECATED_VERSIONS,
} from './common/versioning/versioning.middleware';
import { VersionAnalyticsInterceptor } from './common/versioning/version-analytics.interceptor';
import { VersionAnalyticsService } from './common/versioning/version-analytics.service';
import { GracefulShutdownService } from './common/services/graceful-shutdown.service';
import { createSecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { PageDto } from './common/dto/page.dto';
import { PageMetaDto } from './common/dto/page-meta.dto';
import { TransactionResponseDto } from './modules/transactions/dto/transaction-response.dto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port');

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: CURRENT_VERSION,
  });

  // Apply security headers middleware
  app.use(helmet.default());
  app.use(createSecurityHeadersMiddleware());

  // Apply compression middleware with optimized settings
  app.use(
    compression({
      threshold: 1024, // 1KB threshold - only compress responses larger than 1KB
      level: 6, // Balanced compression level (1-9, where 9 is best compression but slowest)
      filter: (req, res) => {
        // Don't compress responses with Cache-Control: no-transform
        if (req.headers['cache-control']?.includes('no-transform')) {
          return false;
        }
        // Use default compression filter
        return compression.filter(req, res);
      },
    }),
  );

  // Add Vary header for proper caching with compression
  app.use((req, res, next) => {
    res.set('Vary', 'Accept-Encoding');
    next();
  });

  // Register header-based version negotiation + deprecation warnings
  const versioningMiddleware = new VersioningMiddleware();
  app.use(versioningMiddleware.use.bind(versioningMiddleware));

  // Register version analytics interceptor globally
  const versionAnalytics = app.get(VersionAnalyticsService);
  app.useGlobalInterceptors(new VersionAnalyticsInterceptor(versionAnalytics));

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger setup — one document per supported version
  for (const version of ['1', '2']) {
    const isDeprecated = version === '1';
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nestera API')
      .setDescription(
        isDeprecated
          ? '**⚠️ DEPRECATED — Sunset: 2026-09-01. Migrate to v2.**\n\nNestera is a decentralized savings & investment platform on Stellar. All amounts are in USDC (7 decimal places).'
          : 'Nestera is a decentralized savings & investment platform on Stellar. All amounts are in USDC (7 decimal places).',
      )
      .setVersion(version)
      .setContact(
        'Nestera Team',
        'https://github.com/Devsol-01/Nestera',
        'support@nestera.io',
      )
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addServer(`http://localhost:${port || 3001}`, 'Local development')
      .addServer('https://api.nestera.io', 'Production')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [PageDto, PageMetaDto, TransactionResponseDto],
    });
    SwaggerModule.setup(`api/v${version}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: `Nestera API v${version} Docs`,
    });
  }

  const server = await app.listen(port || 3001);
  const logger = app.get(Logger);
  logger.log(`Application is running on: http://localhost:${port}/api`);
  logger.log(
    `Swagger v1 docs (deprecated): http://localhost:${port}/api/v1/docs`,
  );
  logger.log(`Swagger v2 docs: http://localhost:${port}/api/v2/docs`);

  // Setup graceful shutdown
  const gracefulShutdown = app.get(GracefulShutdownService);

  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, starting graceful shutdown...`);
      server.close(async () => {
        await app.close();
        process.exit(0);
      });
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Bootstrap] Application startup failed: ${message}`);
  process.exit(1);
});
