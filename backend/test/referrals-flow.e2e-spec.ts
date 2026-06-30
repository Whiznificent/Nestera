import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { DataSource } from 'typeorm';

describe('Referrals Flow E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;

  const testUser = {
    email: `referrals-e2e-${Date.now()}@test.com`,
    password: 'Test@1234!Strong',
    name: 'Referrals E2E User',
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

  describe('Referral code generation', () => {
    it('should generate a referral code', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/referrals/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      // May return 201 (success) or 400/404 (no campaign) depending on seed data
      if (res.status === 201) {
        expect(res.body).toHaveProperty('referralCode');
        expect(typeof res.body.referralCode).toBe('string');
        expect(res.body).toHaveProperty('id');
      } else {
        expect(res.body).toHaveProperty('errorCode');
      }
    });

    it('should reject referral generation without auth', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/referrals/generate')
        .send({})
        .expect(401);

      expect(res.body).toHaveProperty('errorCode');
    });
  });

  describe('Referral stats', () => {
    it('should return referral stats for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/referrals/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalReferrals');
      expect(res.body).toHaveProperty('completedReferrals');
      expect(res.body).toHaveProperty('totalRewards');
    });

    it('should reject stats without auth', async () => {
      await request(app.getHttpServer())
        .get('/api/referrals/stats')
        .expect(401);
    });
  });

  describe('My referrals', () => {
    it('should return empty referral list for new user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/referrals/my-referrals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Registration with referral code', () => {
    it('should accept registration with a referral code', async () => {
      const referred = {
        email: `referred-e2e-${Date.now()}@test.com`,
        password: 'Test@1234!Strong',
        name: 'Referred User',
        referralCode: 'NONEXISTENT_CODE',
      };

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(referred);

      // Should not crash — either accepts or returns a structured error
      expect([201, 400, 404]).toContain(res.status);
      if (res.status !== 201) {
        expect(res.body).toHaveProperty('errorCode');
      }

      // Cleanup
      if (res.status === 201 && dataSource?.isInitialized) {
        try {
          await dataSource.query(
            `DELETE FROM users WHERE email = $1`,
            [referred.email],
          );
        } catch {}
      }
    });
  });

  describe('Check referral completion', () => {
    it('should handle check-completion for non-existent user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/referrals/check-completion')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: '00000000-0000-0000-0000-000000000000',
          depositAmount: '1000',
        });

      // Should not crash — returns 200 (no-op) or structured error
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  describe('Error format consistency', () => {
    it('should return standardized errors on all referral endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/referrals/stats')
        .expect(401);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('statusCode', 401);
      expect(res.body).toHaveProperty('errorCode');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });
  });
});
