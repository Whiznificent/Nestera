jest.mock('../apm/apm.service', () => ({
  ApmService: jest.fn().mockImplementation(() => ({
    trackDbQuery: jest.fn(),
    trackSlowQuery: jest.fn(),
  })),
}));

import { QueryLoggerService } from './query-logger.service';
import { DataSource } from 'typeorm';
import {
  notifySlowQuery,
  clearSlowQueryHandlers,
} from '../../common/database/query-performance.registry';

describe('QueryLoggerService', () => {
  let service: QueryLoggerService;
  let apmService: { trackDbQuery: jest.Mock; trackSlowQuery: jest.Mock };
  let dataSource: jest.Mocked<Pick<DataSource, 'query'>>;

  beforeEach(() => {
    clearSlowQueryHandlers();
    apmService = {
      trackDbQuery: jest.fn(),
      trackSlowQuery: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
    };
    service = new QueryLoggerService(
      dataSource as unknown as DataSource,
      apmService as never,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    clearSlowQueryHandlers();
  });

  it('records slow queries above 100ms threshold', () => {
    notifySlowQuery({
      query: 'SELECT * FROM users WHERE email = $1',
      duration: 150,
      timestamp: new Date(),
      operation: 'SELECT',
      entity: 'users',
    });

    const slowQueries = service.getSlowQueries();
    expect(slowQueries).toHaveLength(1);
    expect(slowQueries[0].duration).toBe(150);
    expect(apmService.trackDbQuery).toHaveBeenCalledWith(
      'SELECT',
      'users',
      150,
    );
    expect(apmService.trackSlowQuery).toHaveBeenCalledWith(
      150,
      'SELECT',
      'users',
    );
  });

  it('ignores queries below threshold', () => {
    notifySlowQuery({
      query: 'SELECT 1',
      duration: 50,
      timestamp: new Date(),
    });

    expect(service.getSlowQueries()).toHaveLength(0);
    expect(apmService.trackDbQuery).not.toHaveBeenCalled();
  });

  it('detects N+1 query patterns', () => {
    for (let i = 0; i < 6; i++) {
      notifySlowQuery({
        query: 'SELECT * FROM orders WHERE user_id = $1',
        duration: 120,
        timestamp: new Date(),
        operation: 'SELECT',
        entity: 'orders',
      });
    }

    const result = service.detectNPlusOne();
    expect(result.detected).toBe(true);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('suggests indexes for WHERE columns in slow queries', () => {
    notifySlowQuery({
      query: 'SELECT * FROM users WHERE email = $1 AND status = $2',
      duration: 300,
      timestamp: new Date(),
      operation: 'SELECT',
      entity: 'users',
    });

    const suggestions = service.suggestIndexes();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toMatchObject({
      table: 'users',
      priority: expect.stringMatching(/high|medium|low/),
    });
  });

  it('generates optimization report with recommendations', () => {
    for (let i = 0; i < 12; i++) {
      notifySlowQuery({
        query: 'SELECT * FROM savings WHERE user_id = $1',
        duration: 250,
        timestamp: new Date(),
        operation: 'SELECT',
        entity: 'savings',
      });
    }

    const report = service.generateOptimizationReport();
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(report.summary.totalSlowQueries).toBe(12);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.indexSuggestions.length).toBeGreaterThan(0);
  });

  it('returns dashboard with health status', () => {
    notifySlowQuery({
      query: 'SELECT * FROM governance_proposals',
      duration: 180,
      timestamp: new Date(),
      operation: 'SELECT',
      entity: 'governance_proposals',
    });

    const dashboard = service.getDashboard();
    expect(dashboard.summary.totalSlowQueries).toBe(1);
    expect(dashboard.recentSlowQueries).toHaveLength(1);
    expect(dashboard.health.status).toBeDefined();
  });

  it('clears stored metrics', () => {
    notifySlowQuery({
      query: 'SELECT 1',
      duration: 200,
      timestamp: new Date(),
    });

    service.clearMetrics();
    expect(service.getSlowQueries()).toHaveLength(0);
  });
});
