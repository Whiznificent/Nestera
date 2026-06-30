import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { DataSource } from 'typeorm';

describe('Governance Voting E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authToken: string;

  const testUser = {
    email: `governance-e2e-${Date.now()}@test.com`,
    password: 'Test@1234!Strong',
    name: 'Governance E2E User',
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

  describe('Proposal listing', () => {
    it('should list proposals (public, no auth required)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/governance/proposals')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter proposals by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/governance/proposals?status=Active')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/governance/proposals?status=INVALID_STATUS')
        .expect(400);

      expect(res.body).toHaveProperty('errorCode');
      expect(res.body).toHaveProperty('message');
    });
  });

  describe('Proposal creation', () => {
    it('should reject proposal without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/governance/proposals/create')
        .send({
          description: 'Test proposal',
          type: 'RATE_CHANGE',
          action: { target: 'flexiRate', newValue: 10 },
        })
        .expect(401);
    });

    it('should reject proposal with missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it('should reject proposal with invalid type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Test proposal',
          type: 'INVALID_TYPE',
          action: { target: 'flexiRate', newValue: 10 },
        })
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  describe('Voting', () => {
    it('should reject vote on non-existent proposal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/999999/vote')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ direction: 'for' })
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('should reject vote without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/governance/proposals/1/vote')
        .send({ direction: 'for' })
        .expect(401);
    });

    it('should reject vote with missing direction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/1/vote')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('errorCode');
    });
  });

  describe('Proposal lifecycle endpoints', () => {
    it('should reject queue on non-existent proposal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/00000000-0000-0000-0000-000000000000/queue')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('should reject execute on non-existent proposal', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/00000000-0000-0000-0000-000000000000/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });

    it('should get proposal status (404 for non-existent)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/governance/proposals/00000000-0000-0000-0000-000000000000/status')
        .expect(404);

      expect(res.body).toHaveProperty('errorCode');
    });
  });

  describe('Delegation', () => {
    it('should reject delegation without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/governance/delegate')
        .send({ delegateToUserId: '00000000-0000-0000-0000-000000000000' })
        .expect(401);
    });
  });

  describe('Error response standardization', () => {
    it('should include all required error fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/governance/proposals/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('statusCode');
      expect(res.body).toHaveProperty('errorCode');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('path');
      expect(res.body).toHaveProperty('requestId');
    });
  });
});
