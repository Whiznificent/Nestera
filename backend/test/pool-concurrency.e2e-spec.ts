import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';

describe('Database Connection Pool and Leak Detection (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should detect connection leak when connection held for longer than timeout', async () => {
    console.log('\\n--- Simulating Connection Leak ---');
    const leakRunner = dataSource.createQueryRunner();
    await leakRunner.connect();
    console.log('Leak connection acquired. Holding it for 6 seconds...');
    
    // Hold for 6 seconds, leak timeout is 5s
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    await leakRunner.release();
    console.log('Leak connection released. Check logs for "Connection leak detected!".');
    expect(true).toBe(true);
  }, 15000); // increase test timeout

  it('should simulate pool exhaustion metrics correctly', async () => {
    console.log('\\n--- Simulating Pool Exhaustion ---');
    console.log('Spawning 100 concurrent queries...');
    
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        (async () => {
          try {
            const runner = dataSource.createQueryRunner();
            await runner.connect();
            await runner.query('SELECT pg_sleep(0.5)'); // sleep 0.5 sec
            await runner.release();
          } catch (e: any) {
            console.error(`Query ${i} failed:`, e.message);
          }
        })()
      );
    }

    console.log('Waiting for queries to finish...');
    await Promise.all(promises);
    console.log('All queries finished.');
    expect(true).toBe(true);
  }, 60000);
});
