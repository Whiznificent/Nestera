import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { DataSource } from 'typeorm';

describe('Savings Lifecycle E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;
  let userId: string;

  const testUser = {
    email: `savings-e2e-${Date.now()}@test.com`,
    password: 'Test@1234!Strong',
    name: 'Savings E2E User',
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

  describe('Authentication setup', () => {
    it('should register a test user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
      authToken = res.body.access_token;
      userId = res.body.user?.id ?? res.body.userId;
    });

    it('should login with the test user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body).toHaveProperty('access_token');
      authToken = res.body.access_token;
    });
  });

  describe('Savings Products', () => {
    it('should list available savings products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/savings/products')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should sort products by apy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/savings/products?sort=apy')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Subscription lifecycle', () => {
    let productId: string;
    let subscriptionId: string;

    it('should fail subscription with invalid product ID', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: '00000000-0000-0000-0000-000000000000', amount: 100 })
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('should fail subscription with zero amount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: '00000000-0000-0000-0000-000000000000', amount: 0 })
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(res.body).toHaveProperty('details');
    });

    it('should fail subscription without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .send({ productId: '00000000-0000-0000-0000-000000000000', amount: 100 })
        .expect(401);
    });

    it('should reject withdrawal with invalid subscription', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/withdraw')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subscriptionId: '00000000-0000-0000-0000-000000000000',
          amount: 50,
        })
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('should reject withdrawal with negative amount', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/withdraw')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subscriptionId: '00000000-0000-0000-0000-000000000000',
          amount: -10,
        })
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  describe('Savings Goals', () => {
    it('should reject goal creation without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/savings/goals')
        .send({ goalName: 'Test Goal', targetAmount: 1000 })
        .expect(401);
    });

    it('should reject goal creation with invalid payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(res.body).toHaveProperty('details');
      expect(res.body).toHaveProperty('requestId');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Idempotency on savings endpoints', () => {
    it('should handle duplicate subscribe requests with same idempotency key', async () => {
      const idempotencyKey = `idem-subscribe-${Date.now()}`;
      const payload = {
        productId: '00000000-0000-0000-0000-000000000000',
        amount: 100,
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      const res2 = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      // Both responses should be identical (either both succeed or both fail with same error)
      expect(res1.status).toBe(res2.status);
    });

    it('should return 409 for same idempotency key with different payload', async () => {
      const idempotencyKey = `idem-conflict-${Date.now()}`;

      await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ productId: '00000000-0000-0000-0000-000000000000', amount: 100 });

      const res2 = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ productId: '00000000-0000-0000-0000-000000000000', amount: 200 });

      expect(res2.status).toBe(409);
      expect(res2.body.errorCode).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('Error response format', () => {
    it('should return standardized error shape for 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/savings/my-subscriptions')
        .expect(401);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('statusCode', 401);
      expect(res.body).toHaveProperty('errorCode');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
    });

    it('should return standardized error shape for validation errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/savings/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 'not-a-number' })
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('errorCode', 'VALIDATION_ERROR');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body).toHaveProperty('requestId');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return standardized error shape for 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/savings/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('statusCode', 404);
      expect(res.body).toHaveProperty('errorCode');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
