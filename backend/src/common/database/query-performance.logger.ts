import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { notifySlowQuery } from './query-performance.registry';

function parseQueryOperation(query: string): {
  operation: string;
  entity: string;
} {
  const normalized = query.trim().toUpperCase();
  const operation = normalized.split(/\s+/)[0] || 'UNKNOWN';

  const fromMatch = query.match(/\bFROM\s+"?(\w+)"?/i);
  const intoMatch = query.match(/\bINTO\s+"?(\w+)"?/i);
  const updateMatch = query.match(/\bUPDATE\s+"?(\w+)"?/i);

  const entity =
    fromMatch?.[1] || intoMatch?.[1] || updateMatch?.[1] || 'unknown';

  return { operation, entity };
}

export class QueryPerformanceLogger implements TypeOrmLogger {
  logQuery(): void {
    // Only slow queries are recorded via logQuerySlow.
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const message = error instanceof Error ? error.message : error;
    notifySlowQuery({
      query: `[ERROR] ${message}: ${query}`,
      duration: 0,
      timestamp: new Date(),
      params: parameters,
    });
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const { operation, entity } = parseQueryOperation(query);

    notifySlowQuery({
      query,
      duration: time,
      timestamp: new Date(),
      params: parameters,
      operation,
      entity,
    });
  }

  logSchemaBuild(): void {}

  logMigration(): void {}

  log(): void {}
}

export function createQueryPerformanceLogger(): QueryPerformanceLogger {
  return new QueryPerformanceLogger();
}
