import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { DataSource } from 'typeorm';

describe('Transactions Flow E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;

  const testUser = {
    email: `txn-e2e-${Date.now()}@test.com`,
    password: 'Test@1234!Strong',
    name: 'Transaction E2E User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(testUser);
    authToken = registerRes.body.access_token;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      try {
        await dataSource.query(
          `DELETE FROM users WHERE email = $1`,
          [testUser.email],
        );
      } catch {}
    }
    await app?.close();
  });

  describe('Transaction history', () => {
    it('should return empty transaction list for new user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });

    it('should reject unauthenticated transaction listing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions')
        .expect(401);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('errorCode');
    });

    it('should support pagination parameters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions?page=1&take=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
    });

    it('should support filtering by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions?type=deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('should support date range filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions?startDate=2024-01-01&endDate=2026-12-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });

  describe('Transaction export', () => {
    it('should export transactions as CSV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions/export')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('nestera_history.csv');
    });

    it('should reject unauthenticated export', async () => {
      await request(app.getHttpServer())
        .get('/api/transactions/export')
        .expect(401);
    });
  });

  describe('Transaction tagging', () => {
    it('should reject tag on non-existent transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/transactions/00000000-0000-0000-0000-000000000000/tag')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tag: 'groceries' });

      expect([400, 404]).toContain(res.status);
      expect(res.body).toHaveProperty('errorCode');
    });

    it('should list categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Error response consistency', () => {
    it('should include requestId in error responses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/transactions')
        .expect(401);

      expect(res.body).toHaveProperty('requestId');
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.timestamp).toBe('string');
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
    });
  });
});
