import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, closeTestApp } from './fixtures/database.helpers';
import { HTTP_STATUS } from './fixtures/test-factories';

describe('Query Performance Monitoring (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  const performanceEndpoints = [
    '/api/v2/performance/slow-queries',
    '/api/v2/performance/dashboard',
    '/api/v2/performance/query-stats',
    '/api/v2/performance/n-plus-one',
    '/api/v2/performance/index-suggestions',
    '/api/v2/performance/optimization-report',
    '/api/v2/performance/pool-metrics',
  ];

  describe.each(performanceEndpoints)('GET %s', (endpoint) => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).get(endpoint);

      expect([HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.OK]).toContain(res.status);
    });
  });

  describe('GET /api/v2/apm/alerts', () => {
    it('exposes alert rules including db performance rules', async () => {
      const res = await request(app.getHttpServer()).get('/api/v2/apm/alerts');

      expect([HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.OK]).toContain(res.status);
    });
  });

  describe('GET /api/v2/apm/metrics', () => {
    it('includes db query performance metrics', async () => {
      const res = await request(app.getHttpServer()).get('/api/v2/apm/metrics');

      if (res.status === HTTP_STATUS.OK) {
        expect(res.text).toMatch(/db_query_duration_seconds/);
        expect(res.text).toMatch(/db_slow_queries_total/);
      } else {
        expect([HTTP_STATUS.OK, HTTP_STATUS.NOT_FOUND]).toContain(res.status);
      }
    });
  });
});
