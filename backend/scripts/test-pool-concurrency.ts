import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  
  console.log('Database pool initialized.');
  
  // 1. Simulate Connection Leak
  console.log('\\n--- Simulating Connection Leak ---');
  const leakRunner = dataSource.createQueryRunner();
  await leakRunner.connect();
  console.log('Leak connection acquired. Holding it for 7 seconds to trigger leak alert (threshold: 5s)...');
  
  // Wait 7 seconds before releasing to trigger the leak timeout
  await new Promise(resolve => setTimeout(resolve, 7000));
  
  await leakRunner.release();
  console.log('Leak connection released.');

  // 2. Simulate Pool Exhaustion
  console.log('\\n--- Simulating Pool Exhaustion ---');
  console.log('Spawning 100 concurrent queries...');
  
  const promises: Promise<void>[] = [];
  for (let i = 0; i < 100; i++) {
    // These concurrent queries will overwhelm a pool of size 10/50, causing waiting connections.
    promises.push(
      (async () => {
        try {
          // Explicitly get a query runner to hold connection for a bit
          const runner = dataSource.createQueryRunner();
          await runner.connect();
          await runner.query('SELECT pg_sleep(1)'); // sleep 1 second in DB
          await runner.release();
        } catch (e) {
          console.error(`Query ${i} failed:`, e.message);
        }
      })()
    );
  }

  console.log('Waiting for queries to finish...');
  await Promise.all(promises);
  console.log('All queries finished.');

  await app.close();
  console.log('\\nTest completed.');
}

bootstrap().catch((err) => {
  console.error('Test failed', err);
  process.exit(1);
});
